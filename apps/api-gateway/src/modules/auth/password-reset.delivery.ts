import { Injectable } from '@nestjs/common';

/**
 * Explicit delivery seam for a future mail provider. Phase 1 deliberately has
 * no provider: it never logs, persists, or claims to send the opaque token.
 */
@Injectable()
export class PasswordResetDelivery {
  async deliver(_message: { userId: string; email: string; token: string; expiresAt: string }): Promise<{ deliveryAvailable: boolean }> {
    return { deliveryAvailable: false };
  }
}
