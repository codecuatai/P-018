import { BadGatewayException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { TOOL_REGISTRY_COMPATIBILITY, ToolRegistry } from '../../src/modules/tools/tool-registry';

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
          passenger_count: 4,
        },
      }),
    ).toMatchObject({ toolName: 'ride.quote.create', domain: 'ride' });
  });

  it('rejects an invalid Ride passenger count at the tool boundary', () => {
    for (const passenger_count of [0, 1.5, 21, '4']) {
      expect(() => registry.require({
        tool_name: 'ride.quote.create',
        risk_level: 'READ',
        workflow_id: 'wf_passenger_count',
        arguments: {
          pickup_address: 'VinUni',
          dropoff_address: 'Ho Guom',
          vehicle_type: 'CAR_4',
          passenger_count,
        },
      })).toThrow(BadGatewayException);
    }
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
      expect(['IMPLEMENTED_AGENT_TOOL', 'IMPLEMENTED_GATEWAY_ACTION', 'IMPLEMENTED_DOMAIN_API', 'LEGACY_COMPAT', 'DEPRECATED']).toContain(tool.classification);
    }
  });

  it('keeps the runtime registry in parity with the canonical contract inventory', () => {
    const contract = JSON.parse(
      readFileSync(resolve(__dirname, '../../../..', 'packages/contracts/tools/tool-registry-v2.json'), 'utf8'),
    ) as { tools: Array<Record<string, unknown>> };
    const runtime = new Map(registry.list().map((tool) => [tool.name, tool]));
    for (const expected of contract.tools) {
      const actual = runtime.get(String(expected.name));
      expect(actual).toBeDefined();
      expect(actual).toMatchObject({
        domain: expected.domain,
        version: expected.version,
        risk: expected.risk,
        argumentSchema: expected.argument_schema,
        resultSchema: expected.result_schema,
        idempotencyRequirement: expected.idempotency_requirement,
        confirmationRequirement: expected.confirmation_requirement,
        owner: expected.owner,
        classification: expected.classification,
      });
    }
    const canonicalNames = new Set(contract.tools.map((tool) => String(tool.name)));
    const runtimeOnly = new Set(
      [...runtime.keys()].filter((name) => !canonicalNames.has(name)),
    );
    expect(runtimeOnly).toEqual(TOOL_REGISTRY_COMPATIBILITY.names);
    expect(TOOL_REGISTRY_COMPATIBILITY.owner).toBeTruthy();
    expect(Date.parse(TOOL_REGISTRY_COMPATIBILITY.expiresOn)).toBeGreaterThan(Date.now());
  });

  it('recognizes canonical Food, Ride, Restaurant, and Healthcare names', () => {
    for (const toolName of [
      'food.get_restaurant',
      'food.create_cart',
      'food.prepare_order',
      'ride.booking.list',
      'ride.tracking.get',
      'restaurant.list_reservations',
      'healthcare.search_facilities',
      'healthcare.list_appointments',
    ]) {
      expect(registry.list().some((tool) => tool.name === toolName)).toBe(true);
    }
  });

  it('rejects model-supplied authoritative fields and unknown tools', () => {
    expect(() => registry.require({ tool_name: 'unknown.execute', workflow_id: 'wf_test', arguments: {} })).toThrow(BadGatewayException);
    expect(() => registry.require({ tool_name: 'restaurant.search', risk_level: 'READ', workflow_id: 'wf_test', arguments: { location: 'Hà Nội', price: 0 } })).toThrow(BadGatewayException);
    expect(() => registry.require({ tool_name: 'healthcare.hold_slot', workflow_id: 'wf_test', arguments: { slot_id: 10, patient_id: 99 } })).toThrow(BadGatewayException);
  });
});
