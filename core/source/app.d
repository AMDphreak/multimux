import std.stdio;
import std.process;
import std.string;
import std.json;
import std.conv;
import std.algorithm;
import std.concurrency;

version(Windows) {
    import core.sys.windows.windows;
}

/**
 * Main Entry Point of multimux-core
 */
int main(string[] args) {
    if (args.length < 2) {
        writeln(`{"type": "error", "message": "Usage: multimux-core <probe|mux> [args]"}`);
        return 1;
    }

    string command = args[1];

    if (command == "probe") {
        if (args.length < 3) {
            writeln(`{"type": "error", "message": "Probe command requires a file path argument."}`);
            return 1;
        }
        return handleProbe(args[2]);
    } 
    else if (command == "mux") {
        string jsonInput;
        if (args.length >= 3) {
            // Read from command-line arguments
            jsonInput = args[2];
        } else {
            // Read from stdin (piped from Electron)
            char[] buf;
            while (stdin.readln(buf)) {
                jsonInput ~= buf;
            }
        }
        return handleMux(jsonInput.strip());
    } 
    else {
        writefln(`{"type": "error", "message": "Unknown command: %s"}`, command);
        return 1;
    }
}

/**
 * Mode 1: Probe File Metadata
 * Spawns ffprobe and returns JSON results directly
 */
int handleProbe(string filePath) {
    try {
        auto ffprobeArgs = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "stream=index,codec_name,codec_type,channels,channel_layout,bit_rate:stream_tags=title,language:format=duration,size,bit_rate",
            "-of", "json",
            filePath
        ];

        // Execute ffprobe and capture output
        auto res = execute(ffprobeArgs);
        if (res.status == 0) {
            // Print the raw JSON output from ffprobe directly
            writeln(res.output.strip());
            return 0;
        } else {
            writefln(`{"type": "error", "message": "ffprobe failed with status %d. Output: %s"}`, res.status, res.output.escapeJSON());
            return res.status;
        }
    } catch (Exception e) {
        writefln(`{"type": "error", "message": "Failed to spawn ffprobe: %s"}`, e.msg.escapeJSON());
        return 1;
    }
}

/**
 * Mux Configuration Options parsed from Electron
 */
struct MuxOptions {
    string filePath;
    string outputPath;
    string audioCodec;
    string audioBitrate;
    double duration;
    
    struct SelectedStream {
        int relativeIndex;
        double volume;
    }
    SelectedStream[] selectedStreams;
}

/**
 * Mode 2: Multi-Track Audio Muxer with process priority scheduling and progress tracking
 */
int handleMux(string jsonInput) {
    JSONValue parsed;
    try {
        parsed = parseJSON(jsonInput);
    } catch (Exception e) {
        writefln(`{"type": "error", "message": "Failed to parse options JSON: %s"}`, e.msg.escapeJSON());
        return 1;
    }

    // Map JSON options to struct
    MuxOptions options;
    try {
        options.filePath = parsed["filePath"].str;
        options.outputPath = parsed["outputPath"].str;
        options.audioCodec = parsed["audioCodec"].str;
        options.audioBitrate = parsed["audioBitrate"].str;
        options.duration = parsed["duration"].get!double;

        auto streamsVal = parsed["selectedStreams"].array;
        foreach (sVal; streamsVal) {
            MuxOptions.SelectedStream s;
            s.relativeIndex = cast(int)sVal["relativeIndex"].integer;
            s.volume = sVal["volume"].get!double;
            options.selectedStreams ~= s;
        }
    } catch (Exception e) {
        writefln(`{"type": "error", "message": "Invalid options schema: %s"}`, e.msg.escapeJSON());
        return 1;
    }

    try {
        string[] ffmpegArgs = ["ffmpeg", "-y", "-i", options.filePath];

        if (options.selectedStreams.length == 0) {
            // Strip audio
            ffmpegArgs ~= ["-map", "0:v", "-c:v", "copy", "-an", options.outputPath];
        } 
        else if (options.selectedStreams.length == 1) {
            auto stream = options.selectedStreams[0];
            if (stream.volume == 1.0 && (options.audioCodec == "copy" || options.audioCodec == "passthrough")) {
                ffmpegArgs ~= [
                    "-map", "0:v",
                    "-map", "0:a:" ~ to!string(stream.relativeIndex),
                    "-c:v", "copy",
                    "-c:a", "copy",
                    options.outputPath
                ];
            } else {
                string volumeFilter = "[0:a:" ~ to!string(stream.relativeIndex) ~ "]volume=" ~ to!string(stream.volume) ~ "[a]";
                ffmpegArgs ~= [
                    "-filter_complex", volumeFilter,
                    "-map", "0:v",
                    "-map", "[a]",
                    "-c:v", "copy",
                    "-c:a", options.audioCodec == "copy" ? "aac" : options.audioCodec,
                    "-b:a", options.audioBitrate,
                    options.outputPath
                ];
            }
        } 
        else {
            // Multiple audio tracks to be mixed via amix
            string filterComplex = "";
            string[] inputLabels;
            foreach (i, stream; options.selectedStreams) {
                string label = "a" ~ to!string(i);
                filterComplex ~= "[0:a:" ~ to!string(stream.relativeIndex) ~ "]volume=" ~ to!string(stream.volume) ~ "[" ~ label ~ "]; ";
                inputLabels ~= "[" ~ label ~ "]";
            }
            filterComplex ~= join(inputLabels, "") ~ "amix=inputs=" ~ to!string(options.selectedStreams.length) ~ ":duration=longest:dropout_transition=0[a]";

            ffmpegArgs ~= [
                "-filter_complex", filterComplex,
                "-map", "0:v",
                "-map", "[a]",
                "-c:v", "copy",
                "-c:a", options.audioCodec == "copy" ? "aac" : options.audioCodec,
                "-b:a", options.audioBitrate,
                options.outputPath
            ];
        }

        // Spawn FFmpeg as a piped subprocess
        auto pipes = pipeProcess(ffmpegArgs, Redirect.stdout | Redirect.stderr);
        
        // Adjust priority to BELOW_NORMAL_PRIORITY_CLASS to keep system highly responsive
        version(Windows) {
            SetPriorityClass(pipes.pid.osHandle, BELOW_NORMAL_PRIORITY_CLASS);
        }

        // Spawn background D-thread to read stderr line-by-line and calculate progress
        auto tid = spawn(&trackProgressThread, options.duration);

        // Read stdout and stderr loops in main thread
        foreach (line; pipes.stderr.byLine) {
            string lineStr = line.idup.strip();
            if (lineStr.length == 0) continue;

            // Send standard raw logging event back to Electron
            writefln(`{"type": "log", "message": "%s"}`, lineStr.escapeJSON());

            // Look for time=HH:MM:SS.xx to send to tracking thread
            auto idx = lineStr.indexOf("time=");
            if (idx != -1 && lineStr.length >= idx + 16) {
                string timeStr = lineStr[idx + 5 .. idx + 16]; // Slice out "HH:MM:SS.xx"
                tid.send(timeStr);
            }
        }

        // Wait for child process to exit
        auto exitStatus = pipes.pid.wait();
        
        // Notify tracking thread of exit
        tid.send(exitStatus);

        if (exitStatus == 0) {
            writeln(`{"type": "progress", "percent": 100.0, "message": "Success"}`);
            writeln(`{"type": "done"}`);
            return 0;
        } else {
            writefln(`{"type": "error", "message": "ffmpeg failed with exit code %d."}`, exitStatus);
            return exitStatus;
        }

    } catch (Exception e) {
        writefln(`{"type": "error", "message": "Exception in muxing process: %s"}`, e.msg.escapeJSON());
        return 1;
    }
}

/**
 * Thread that processes time stamps from FFmpeg and outputs clean progress JSON lines
 */
void trackProgressThread(double duration) {
    bool running = true;
    while (running) {
        receive(
            (string timeStr) {
                // Parse "HH:MM:SS.xx" to double seconds
                // Zero-allocation string slicing and parsing
                try {
                    auto parts = timeStr.split(":");
                    if (parts.length == 3) {
                        double hours = to!double(parts[0]);
                        double minutes = to!double(parts[1]);
                        double seconds = to!double(parts[2]);
                        
                        double currentSeconds = hours * 3600.0 + minutes * 60.0 + seconds;
                        if (duration > 0) {
                            double percent = (currentSeconds / duration) * 100.0;
                            percent = Math_min(99.9, Math_max(0.0, percent));
                            writefln(`{"type": "progress", "percent": %.2f}`, percent);
                            stdout.flush(); // Flush stdout immediately for Electron IPC
                        }
                    }
                } catch (Exception e) {
                    // Ignore malformed time timestamps
                }
            },
            (int exitStatus) {
                running = false;
            }
        );
    }
}

/**
 * Escapes characters for safe embed in JSON strings
 */
string escapeJSON(string s) {
    return s.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
}

double Math_min(double a, double b) { return a < b ? a : b; }
double Math_max(double a, double b) { return a > b ? a : b; }
