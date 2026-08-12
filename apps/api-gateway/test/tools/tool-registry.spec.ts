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

  it('exposes versioned metadata for all four domain owners', () => {
    const tools = registry.list();
    expect(new Set(tools.map((tool) => tool.domain))).toEqual(new Set(['food', 'ride', 'restaurant', 'healthcare']));
    for (const tool of tools) {
      expect(tool.version).toBe(2);
      expect(tool.toolName).toBe(tool.name);
      expect(tool.owner).toBeTruthy();
      expect(tool.argumentSchema).toBeTruthy();
      expect(tool.resultSchema).toBeTruthy();
    }
  });

  it('rejects model-supplied authoritative fields and unknown tools', () => {
    expect(() => registry.require({ tool_name: 'unknown.execute', workflow_id: 'wf_test', arguments: {} })).toThrow(BadGatewayException);
    expect(() => registry.require({ tool_name: 'restaurant.search', risk_level: 'READ', workflow_id: 'wf_test', arguments: { location: 'Hà Nội', price: 0 } })).toThrow(BadGatewayException);
    expect(() => registry.require({ tool_name: 'healthcare.hold_slot', workflow_id: 'wf_test', arguments: { slot_id: 10, patient_id: 99 } })).toThrow(BadGatewayException);
  });
});
