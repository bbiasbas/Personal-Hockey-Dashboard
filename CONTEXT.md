# Personal Fantasy Hockey Dashboard

One manager's Yahoo H2H-points, daily-lineup hockey team, seen through a read-only advisor.

## Language

### Streaming

**Stream**:
Adding a free agent for a short stretch (one game to a few days) to use an open start, then dropping him again.
_Avoid_: Spot pickup, rental

**Streaming Center**:
The tab that recommends streams as add/drop pairs, each with a reason. It recommends; the manager makes the move in Yahoo.

**Net gain**:
A stream's value: the added player's projected points minus the dropped player's, over the rest of the matchup week.

**Week plan**:
A sequence of streams, day by day through the end of the matchup week, that fits within adds left.

**Day view**:
Ad hoc analysis of one chosen day: open starts by position and the best stream for each.

**Waiver claim**:
A stream of a player on waivers. It can't take effect before his clear date and isn't guaranteed.
_Avoid_: Free-agent add (that means a player available right away)

**Confirmed start / Likely start**:
A goalie's start status from DailyFaceoff. Only these count as a goalie's open start; days without a report are projected only.

**Open start**:
A game a player would actually start for the manager: his team plays that day and the manager has an empty active slot he is eligible for, once the current lineup is set.
_Avoid_: Games left (that counts every game, started or not)

**Light night**:
A day on which the manager has at least one open start at a given position. Defined by the manager's own lineup, not by how many NHL teams play.
_Avoid_: Off-night

**Streamer slot**:
A roster player the Streaming Center may suggest dropping: one the manager marked as droppable, or anyone the manager added during the current matchup week. An empty roster spot is a free streamer slot (add with no drop).
_Avoid_: Weakest spot, flex slot

**Adds left**:
How many more adds the league allows the manager in the current matchup week, from Yahoo's league settings.

**Opponent strength**:
An NHL team's goals for and against per game, used to judge whether a matchup is favorable for a skater or goalie.
