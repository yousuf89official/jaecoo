# Jaecoo organic-channel onboarding

Jaecoo currently has no readable IG, Facebook, or TikTok channel in `social_channel_list`. Until the following owner-controlled process succeeds, profile and organic sections must remain in the connection-required state.

## Meta: Facebook + Instagram

1. Assign the Jaecoo Facebook Page and `@jaecoo.id` Instagram account to the Meta business that owns the Prime System User.
2. Grant `read_insights`, `pages_read_engagement`, `instagram_basic`, and `instagram_manage_insights`.
3. Register the Jaecoo brand asset and both social identities in WAC using verified token slots.
4. Add permanent read grants.
5. Confirm both channels appear in `social_channel_list` with `can_read:true`.

## TikTok organic

1. Re-authorise using the `@jaecoo.id` business account.
2. Approve `user.info.stats`, `video.list`, and `video.insights`.
3. Register the identity and its verified token slot in WAC.
4. Add a permanent read grant.
5. Confirm the TikTok channel appears in `social_channel_list` with `can_read:true`.

## Guardrails

- Registration and grant operations require owner credentials and are not called by browser requests or the dashboard read API.
- Do not reuse another client's registered organic channel.
- Do not insert follower, profile, or post values manually to make the profile chrome appear complete.
- After access is granted, run incremental ingestion and verify the exact handle, parent account, token slot, and latest post before marking the source connected.

## Guarded dashboard action

The profile connection card exposes an owner-only action backed by `POST /api/admin/onboard-organic`. It requires `Authorization: Bearer $ADMIN_REFRESH_SECRET` and reads its tool arguments from `JAECOO_ORGANIC_ONBOARDING_JSON` on the server.

The JSON structure is:

```json
{
  "brandAssets": [{ "tool-specific": "brand_asset_register arguments" }],
  "channels": [
    {
      "platform": "instagram",
      "handle": "jaecoo.id",
      "register": { "tool-specific": "social_channel_register arguments" },
      "grant": { "tool-specific": "social_channel_grant_upsert arguments" }
    }
  ]
}
```

Include Instagram, Facebook, and TikTok. Store token-slot names only—never access-token values. The route rejects a plan for another handle or platform set and does not report success until `social_channel_list` confirms all three with `can_read:true`.
