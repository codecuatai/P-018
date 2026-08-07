import { BadGatewayException, Injectable } from '@nestjs/common';

export type ToolProposal = {
  tool_name: string;
  risk_level: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
  arguments: Record<string, unknown>;
  workflow_id: string;
};

export type ToolDefinition = {
  toolName: string;
  riskLevel: ToolProposal['risk_level'];
  domain: 'ride';
};

const definitions: readonly ToolDefinition[] = [
  { toolName: 'ride.quote.create', riskLevel: 'READ', domain: 'ride' },
  { toolName: 'ride.booking.prepare', riskLevel: 'REVERSIBLE_WRITE', domain: 'ride' },
  { toolName: 'ride.booking.status.get', riskLevel: 'READ', domain: 'ride' },
  { toolName: 'ride.booking.cancel.prepare', riskLevel: 'REVERSIBLE_WRITE', domain: 'ride' },
];

@Injectable()
export class ToolRegistry {
  require(proposal: ToolProposal): ToolDefinition {
    const definition = definitions.find((candidate) => candidate.toolName === proposal.tool_name);
    if (
      !definition
      || definition.riskLevel !== proposal.risk_level
      || !isNonEmptyString(proposal.workflow_id, 128)
      || !isRecord(proposal.arguments)
    ) {
      throw new BadGatewayException('Agent proposed an unsupported tool.');
    }
    validateArguments(definition.toolName, proposal.arguments);
    return definition;
  }
}

function validateArguments(toolName: string, arguments_: Record<string, unknown>): void {
  const valid = toolName === 'ride.quote.create'
    ? onlyKeys(arguments_, ['pickup_address', 'dropoff_address', 'vehicle_type', 'promo_code'])
      && isNonEmptyString(arguments_.pickup_address, 300)
      && isNonEmptyString(arguments_.dropoff_address, 300)
      && ['BIKE', 'CAR_4', 'CAR_7'].includes(String(arguments_.vehicle_type))
      && (arguments_.promo_code === undefined || isNonEmptyString(arguments_.promo_code, 50))
    : toolName === 'ride.booking.prepare'
      ? onlyKeys(arguments_, ['quote_id']) && isNonEmptyString(arguments_.quote_id, 128)
      : onlyKeys(arguments_, ['booking_id']) && isNonEmptyString(arguments_.booking_id, 128);
  if (!valid) {
    throw new BadGatewayException('Agent tool arguments are invalid.');
  }
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
