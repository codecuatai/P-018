import { Global, Module } from '@nestjs/common';

import {
  AgentClient,
  FoodClient,
  HealthcareClient,
  RestaurantClient,
  RideClient,
} from './service.clients';

@Global()
@Module({
  providers: [AgentClient, RideClient, RestaurantClient, HealthcareClient, FoodClient],
  exports: [AgentClient, RideClient, RestaurantClient, HealthcareClient, FoodClient],
})
export class ClientsModule {}
