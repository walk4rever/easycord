# Autoresearch ideas

- If cold-start latency still dominates, evaluate self-hosting FFmpeg core assets instead of fetching them from `unpkg` on first conversion.
- Consider prewarming the FFmpeg worker/core even earlier (for example after camera startup rather than at recording start) if the added background work does not hurt UX.
- Probe whether Firefox can use a realistic direct-MP4 path (for example WebCodecs) before paying the FFmpeg transcode cost.
