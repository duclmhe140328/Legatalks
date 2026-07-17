# Kiến trúc triển khai khuyến nghị

## Bản hiện tại

```text
React Web ── REST ── Express ── MongoDB
     │                    │
     └── Socket.IO ───────┤ realtime/presence/signaling
     └── WebRTC P2P ──────┘ STUN/TURN
```

## Khi tăng tải

```text
CDN / Object Storage
        │
Web / Mobile Apps
        │
Load Balancer
        │
API instances ── Redis adapter ── Socket.IO instances
        │                │
 MongoDB replica set   BullMQ workers
        │                │
 Search/OpenSearch     Push/SMS/Webhook
        │
 SFU cluster (LiveKit/mediasoup) + Coturn
```

- Phân vùng message theo `conversationId` và thời gian khi dữ liệu rất lớn.
- Dùng outbox/event bus cho notification, webhook, broadcast và indexing.
- Dùng idempotency key cho message clientId và payment orderId.
- Mã hóa media/object storage, signed URL và retention policy.
