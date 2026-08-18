import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../shared/database/database.service';
import { NotFoundApplicationError } from '../../../shared/errors/application.error';

export interface PaymentCustomerProfile {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

/**
 * The allowlisted identity facts needed to pre-fill a hosted payment form.
 * Payments must not read the identity-owned User row directly.
 */
@Injectable()
export class PaymentCustomerProfileService {
  constructor(private readonly database: DatabaseService) {}

  async getForUser(userId: string): Promise<PaymentCustomerProfile> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        first_name: true,
        last_name: true,
        email: true,
        phone_number: true,
        country: true,
        region: true,
        city: true,
      },
    });

    if (!user) {
      throw new NotFoundApplicationError(
        'Payment customer profile was not found',
        'PAYMENT_CUSTOMER_PROFILE_NOT_FOUND',
      );
    }

    return {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phoneNumber: user.phone_number,
      country: user.country,
      region: user.region,
      city: user.city,
    };
  }
}
