# Autoresearch ideas

- Benchmark whether transferring an `ArrayBuffer` into the worker is materially faster than cloning the `Blob` on Firefox for multi-megabyte recordings.
- If cold-start latency dominates, evaluate self-hosting FFmpeg core assets instead of fetching them from `unpkg` on first conversion.
- Prewarm the FFmpeg worker/core while Firefox is recording (or immediately after camera startup) so the user waits less after pressing stop even if total background work is unchanged.
- Probe whether Firefox can use a realistic direct-MP4 path (for example WebCodecs) before paying the FFmpeg transcode cost.
