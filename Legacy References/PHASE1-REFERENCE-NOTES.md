# The Lost Valley — Phase 1 Reference Candidate

## Scope and source status

The original game source was not present in the project mirror. The available `lost-valley-field-update.html` is a small prototype created during this chat, not the original 2D game. It is preserved unchanged as the baseline for this candidate. This reference build therefore stabilizes only the available prototype; it does not verify or reproduce the original game's recipe list, survival rules, minimap, or save format.

## Candidate build

Open `lost-valley-reference-v1.html` in a desktop browser. It remains a self-contained HTML file and uses no external assets.

- Move with WASD or the arrow keys. Movement, stamina use, and exhaustion damage now use elapsed time, so game speed does not depend on display refresh rate.
- Gather materials only while close to trees or rocks. An unsuccessful attempt does not add resources or consume stamina.
- The signal-fire recipe costs 3 wood and 2 stone and can only be built at the marked ridge.
- The map overlay marks the player, remaining trees and stones, creek, and ridge. Resizing redraws the map without restoring depleted resources.
- Save writes the current run to this browser's local storage. The build also saves during movement and after gathering or crafting, then restores the last run on startup. New run clears that local save.

## Repeatable checks

Run from the project folder:

```powershell
node --test .\tests\field-reference.test.cjs
```

The automated checks cover movement, nearby gathering, failed gathering, stamina and exhaustion damage, ridge recipe gating, resource deduction, save and restore, resize persistence, and starting a new run. They use a lightweight simulated browser surface; they do not replace a visual check in a real browser.

## Remaining Phase 1 work

- Obtain and preserve the original HTML and any companion files to perform the roadmap's actual baseline review.
- Compare the original movement, gathering, recipes, survival, minimap, and saving against this candidate and carry over only intended behaviors.
- Check the candidate visually at desktop and narrow window sizes, and verify local save behavior in the browsers the project will support. `file:` pages may restrict local storage differently across browsers.
- Update this note with any balance changes and the verified original-game behavior before treating the candidate as the 2D reference build.