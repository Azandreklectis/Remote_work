# Game Stream

A low-latency game streaming system that allows a game running on a Windows gaming PC to be played remotely from a phone over a local network.

The initial target is **The Binding of Isaac**.

The PC performs the game rendering and video processing. The phone acts as the display and input device.

---

## Architecture

```text
                         GAMING PC
                ┌─────────────────────────┐
                │                         │
                │        CONTENT          │
                │           │             │
                │           ▼             │
                │    Screen Capture       │
                │           │             │
                │           ▼             │
                │    Video Encoder        │
                │           │             │
                │           ▼             │
                │        WebRTC           │
                │           │             │
                │           ▼             │
                └───────────┼─────────────┘
                            │
                         Wi-Fi/LAN
                            │
                            ▼
                ┌─────────────────────────┐
                │          PHONE          │
                │                         │
                │        WebRTC           │
                │           │             │
                │           ▼             │
                │      Video Display      │
                │                         │
                │     Touch Controls      │
                │           │             │
                └───────────┼─────────────┘
                            │
                            │ Input
                            ▼
                         GAMING PC