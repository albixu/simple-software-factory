import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  LeaseHeartbeat,
  LeaseOwnershipLostError
} from "#/idempotency/recovery/lease-heartbeat.js";

describe("LeaseHeartbeat", () => {

  it(
    "runs an operation while renewing the lease",
    async () => {

      const heartbeat = new LeaseHeartbeat(10);

      const renew = vi.fn(
        async () => true
      );

      const result = await heartbeat.run(
        { renew },

        async signal => {

          await new Promise<void>(resolve => {
            setTimeout(resolve, 35);
          });

          signal.throwIfAborted();

          return "ISSUE-123";
        }
      );

      expect(result).toBe("ISSUE-123");

      expect(renew).toHaveBeenCalled();
    }
  );

  it(
    "aborts when lease ownership is lost",
    async () => {

      const heartbeat = new LeaseHeartbeat(10);

      const renew = vi.fn(
        async () => false
      );

      await expect(
        heartbeat.run(
          { renew },

          async signal => {

            /*
             * Esperamos hasta recibir cancelación.
             */

            return new Promise<string>(
              (_, reject) => {

                signal.addEventListener(
                  "abort",
                  () => {
                    reject(signal.reason);
                  },
                  { once: true }
                );
              }
            );
          }
        )
      ).rejects.toBeInstanceOf(
        LeaseOwnershipLostError
      );
    }
  );

  it(
    "stops renewing after the operation completes",
    async () => {

      const heartbeat = new LeaseHeartbeat(10);

      const renew = vi.fn(
        async () => true
      );

      await heartbeat.run(
        { renew },

        async () => "completed"
      );

      const callsAfterCompletion =
        renew.mock.calls.length;

      await new Promise<void>(resolve => {
        setTimeout(resolve, 30);
      });

      expect(renew).toHaveBeenCalledTimes(
        callsAfterCompletion
      );
    }
  );
});