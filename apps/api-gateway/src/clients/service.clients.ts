import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

abstract class InternalServiceClient {
  constructor(protected readonly config: ConfigService, private readonly urlKey: string) {}

  get baseUrl(): string {
    return this.config.getOrThrow<string>(this.urlKey);
  }
}

@Injectable()
export class AgentClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'AGENT_SERVICE_URL'); }
}
@Injectable()
export class RideClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'RIDE_SERVICE_URL'); }
}
@Injectable()
export class RestaurantClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'RESTAURANT_SERVICE_URL'); }
}
@Injectable()
export class HealthcareClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'HEALTHCARE_SERVICE_URL'); }
}
@Injectable()
export class FoodClient extends InternalServiceClient {
  constructor(config: ConfigService) { super(config, 'FOOD_SERVICE_URL'); }
}
