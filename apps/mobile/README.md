# X-One Mobile Application

The Expo shell is preserved and remains independent of the backend foundation.

```bash
cd apps/mobile
npm install
npm start
```

When mock flows are replaced, mobile must call only the public NestJS gateway at `http://<LOCAL_IP>:3000/api/v1`; it must not call the agent or a domain service directly. Business endpoints and realtime transport are not implemented yet.
