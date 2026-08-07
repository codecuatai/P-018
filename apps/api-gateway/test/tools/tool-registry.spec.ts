import { BadGatewayException } from '@nestjs/common';

import { ToolRegistry } from '../../src/modules/tools/tool-registry';

describe('ToolRegistry', () => {
  const registry = new ToolRegistry();

  it('accepts the registered Ride quote proposal', () => {
    expect(
      registry.require({
        tool_name: 'ride.quote.create',
        risk_level: 'READ',
        workflow_id: 'wf_test',
        arguments: {
          pickup_address: 'VinUni',
          dropoff_address: 'Ho Guom',
          vehicle_type: 'CAR_4',
        },
      }),
    ).toMatchObject({ toolName: 'ride.quote.create', domain: 'ride' });
  });

  it('fails closed for risk mismatch and unexpected arguments', () => {
    expect(() =>
      registry.require({
        tool_name: 'ride.quote.create',
        risk_level: 'REVERSIBLE_WRITE',
        workflow_id: 'wf_test',
        arguments: {},
      }),
    ).toThrow(BadGatewayException);

    expect(() =>
      registry.require({
        tool_name: 'ride.quote.create',
        risk_level: 'READ',
        workflow_id: 'wf_test',
        arguments: {
          pickup_address: 'VinUni',
          dropoff_address: 'Ho Guom',
          vehicle_type: 'CAR_4',
          endpoint: 'http://untrusted.example',
        },
      }),
    ).toThrow(BadGatewayException);
  });
});
