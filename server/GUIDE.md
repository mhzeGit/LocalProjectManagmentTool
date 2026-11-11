# pm: guide for AI agents

`pm` reads and writes the user's project manager (the Task Board web app). Every
change appears live in the user's open window and is saved to the same JSON
files the web app uses. Nothing is ever deleted: cards are archived.

Always pass who you are: `--agent "Claude Code"` (or set `PM_AGENT`).
Add `--json` to any command for machine-readable output.
Exit codes: 0 ok, 1 error, 2 not found / nothing to do.

## Start every session with

    pm status          brief, milestones, Now, This Week, overdue, counts
    pm doc show direction    the project's goal, scope and focus rules

## The plan

`pm setup` creates it (safe to rerun): a **Production** board with five columns
that have fixed roles, plus a **Direction** document.

| Role | Column | Meaning |
| --- | --- | --- |
| `now` | Now | What the user works on today. At most `wipLimit` (default 3) open cards. |
| `week` | This Week | Committed for this week, in order. |
| `backlog` | Backlog | Planned work, grouped by milestone, in priority order. |
| `parking` | Parking Lot | Ideas and distractions. Nothing here is planned. |
| `done` | Done | Finished, newest first. |

Columns are addressed by role (`now`, `week`, `backlog`, `parking`, `done`) or name.
Cards by id (`aj53qqtd`, `id123`) or by a unique part of the title.
Milestones by id, name or prefix (`M1`).

A good card:
- title starts with a verb and names one outcome ("Fix the chapter 3 softlock");
- `--estimate` of 4h or less (split bigger work with `pm split`);
- `--why`: one line on why it matters for the current milestone;
- description (Markdown) says what "done" means; `- [ ] step` lines become checklist steps;
- `--milestone` set, `--priority` 1-5 (5 = most important).

## Commands

    pm status | ls [column] [-m M1] [--tag t] [-s text] [--all] | show CARD
    pm add "Title" [-c backlog] [-m M1] [-P 4] [-e 3h] [--due fri] [--why "..."] [-d "markdown"] [--step "..."]
    pm edit CARD [--title] [-P] [-e] [--start] [--due] [-m] [--why] [-d | --append] [--tag | --untag] [--pin]
    pm move CARD now|week|backlog|parking|done [--position top|N]
    pm done CARD [-s "what was done"]        pm reopen CARD        pm archive CARD
    pm split CARD "Part A::2h" "Part B::3h" [--keep]
    pm step CARD "text" ...                   pm check CARD 2[.1] [--undo]
    pm milestone [ls] | add "M1 Name" --due 2026-12-06 --goal "..." | edit M1 [--due] [--goal] [--close] | remove M1
    pm settings [--hours 4] [--days mon-fri] [--wip 3]
    pm schedule [--dry-run]     dates every open card from estimates and capacity; forecasts milestones
    pm rollover                 start of day: done -> Done, today's cards -> Now, this week's -> This Week
    pm brief "text"             the note shown on top of the user's Focus page ("" clears)
    pm doc ls | show NAME | write NAME --file plan.md [--append]
    pm boards | column NAME [--board B] | log [-n 20] | projects | open

Dates: `2026-12-06`, `today`, `tomorrow`, `+3d`, `+2w`, `fri`. Estimates: `3h`, `90m`, `1.5`, `2d` (days use the capacity's hours per day).

## Producer routine

**Plan (once, then when scope changes)**
1. Read the Direction doc and the project's own status docs. Fill Direction with the user: goal, release target, scope in/out.
2. Create 3-6 milestones with due dates (`pm milestone add`), each a playable or shippable result, with a one-line goal.
3. Break each milestone into cards of 4h or less, with estimates, `--why` and a definition of done.
4. Set capacity honestly (`pm settings --hours`), run `pm schedule`, and report milestones that are at risk. Cut scope or move dates with the user; never hide risk.

**Daily**
1. `pm rollover`, then `pm status`.
2. Make sure Now holds at most the WIP limit, and the top card is the most important thing.
3. Post a brief (`pm brief`): 2-4 short lines - the one thing that matters today, what to ignore, and any risk.

**Weekly**
1. Close or reopen what changed, re-estimate, `pm schedule`, fill This Week.
2. Append a short review to a "Weekly review" document (`pm doc write "Weekly review" --append`).

## Rules

- Protect focus: new ideas go to Parking Lot with `--why`; never straight into Now.
- Never delete or rename the user's own cards without asking; archive instead.
- Move cards the user is working on only when the user asked or the routine says so.
- Keep briefs short and concrete. No motivational filler.
- Changes are visible instantly; batch related edits so the board does not flicker for minutes.
