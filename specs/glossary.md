# Shared language

| Term | Meaning | Avoid confusion with |
| --- | --- | --- |
| Library track | A user-owned audio file indexed from a connected storage provider | A cached YouTube metadata row |
| YouTube track | A playable metadata record whose ID is `yt:` followed by the video ID | Server-hosted or server-resolved YouTube audio |
| Connection | One user's OAuth-authorized account at Google Drive, Dropbox, or OneDrive | The user's primary Google sign-in account |
| Scan root | A selected remote folder included in library indexing | A local filesystem folder |
| Scan job | Persisted listing and metadata-processing work for one connection | A deployment or background worker service |
| Native shell | Windows Tauri or Android Expo runtime using a native audio engine | The browser-only web runtime |
| Handoff code | A 120-second, single-use code exchanged for a native bearer session | The bearer session JWT itself |
| Radio | A client-managed queue extended from YouTube up-next metadata | Broadcast radio or an independent streaming service |
| Play history | User-scoped completed/partial listening records used by library surfaces | Anonymous product telemetry |
| Product telemetry | Anonymous allowlisted operational events keyed by install/session IDs | User-scoped play history |
