# Public indicators and quote review — October 18, 2026

The panel used an auto-fit grid with 120-pixel columns and truncated labels. It
also displayed one reception-unavailable warning for every source together.
The revised panel groups audience/attention, charts/media, trading activity and
fan samples; labels wrap, sample explanations stay with their source, and each
observation carries its own date. Last.fm catalogue totals are also visible.

YouTube and Bluesky have separate reception status. A valid YouTube sample
survives a Bluesky outage. Zero measured reactions means insufficient reception
evidence, while measured neutral sentiment with a nonempty sample can remain
zero. Estimates and counts from different collection days cannot be presented
as one sample. Missing/non-finite observations cannot become measured zero;
actual chart zeros are preserved. Public histories remain intact.

Browser checks exercise the reported 28%/2%, 50-comment/15-identifiable-reaction
case, a missing social sample, mobile/desktop widths, both themes, stale reception
and refresh failures. No price formula or stored quote is changed by this UI fix.

## Price review

Read all 89 active quotes, current source observations, recorded price history,
recent events and saved pricing inputs. The broad monthly observation query hit
the database timeout; current-day observations were retrieved with a narrower
query and combined with the earlier same-day capture for historical comparisons.
Current quote capture was around 23:01 UTC (6:01 p.m. Central).

| Artist | Current quote | Recorded 30-day price change | Spotify listener change since September 18 |
| --- | ---: | ---: | ---: |
| Drake | $200.03 | +34.33% | −0.52% |
| Quavo | $113.11 | +15.47% | +24.06% |
| Tezzus | $54.47 | +35.46% | +12.85% |
| Ye | $120.66 | +0.67% | −0.93% |
| Young Thug | $115.34 | +1.78% | −0.10% |

Drake is the strongest inherited-price concern. Saved older inputs show repeated
chart-story shocks, including multiple reports about the same release cycle.
The current engine prevents repeated pricing, but that does not automatically
reverse the cumulative effect already embedded in an earlier quote. Tezzus is
also a review candidate; Quavo's observed audience growth supports a material
premium and should not be discarded just because an audience-only anchor is
lower. Ye and Young Thug do not warrant an automatic increase simply because
there was concert attention or a new release.

Audience valuation is a shared scale, not independent proof of a fair dollar
price. Earlier v45 shadow values are counterfactual diagnostics with known
validation limitations, not validated v46 replacement quotes. This review does
not justify pasting those numbers into production, resetting every artist or
rewriting historical prices. A corrective quote requires an audited reconstruction
of the erroneous contribution; a gap from the audience baseline alone is not
that reconstruction. No manual price adjustment was published in this change.
