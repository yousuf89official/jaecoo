import { describe, expect, it } from 'vitest';
import { planSchema } from '../../api/admin/onboard-organic.ts';

const args = { brand_id: 'jaecoo' };

describe('organic onboarding plan', () => {
  it('accepts exactly one Jaecoo channel for each supported platform', () => {
    const result = planSchema.safeParse({
      brandAssets: [args],
      channels: ['instagram', 'facebook', 'tiktok'].map((platform) => ({
        platform,
        handle: '@JAECOO.ID',
        register: args,
        grant: args,
      })),
    });

    expect(result.success).toBe(true);
  });

  it('rejects duplicate platforms and non-Jaecoo handles', () => {
    const duplicate = planSchema.safeParse({
      brandAssets: [args],
      channels: ['instagram', 'instagram', 'tiktok'].map((platform) => ({
        platform,
        handle: 'jaecoo.id',
        register: args,
        grant: args,
      })),
    });
    const wrongHandle = planSchema.safeParse({
      brandAssets: [args],
      channels: ['instagram', 'facebook', 'tiktok'].map((platform) => ({
        platform,
        handle: 'another.brand',
        register: args,
        grant: args,
      })),
    });

    expect(duplicate.success).toBe(false);
    expect(wrongHandle.success).toBe(false);
  });
});
