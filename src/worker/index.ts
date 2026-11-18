import { handle } from "@astrojs/cloudflare/handler";
import { purgeExpiredContent, type CleanupEnv } from "./cleanup";

export { RoomHub } from "./room-hub";

export default {
  fetch: handle,
  async scheduled(
    _controller: ScheduledController,
    env: CleanupEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      purgeExpiredContent(env).catch((err) => {
        console.error("Scheduled cleanup error:", err);
      })
    );
  },
};
