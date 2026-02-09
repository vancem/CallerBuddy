# CallerBuddy Backlog (Things that need to be done or have been decided)

Please also see CallerBuddySpec.md for the specification of user behavior.

## Rules

- Whenever there is a design question, the it should be added as an task list
  item in BACKLOG.md. Small questions / issues can be placed in code files as
  TODO items, however, they should also have an explicit task list item in the
  BACKLOG.md file if they are important (need to be fixed before the next
  release) HIGH: MEDIUM: and LOW: markers can be placed on the item to indicate
  its priority. It is OK to guess answers to questions if the amount of rework
  needed if the guess was not correct small. Otherwise the question should be
  logged in BACKLOG.md
- Answers to the question can be placed as sub-bullets of question, or they
  could be moved to the design decisions section, or the CallerBuddySpec.md file
  if they an important user-facing decision.
- Note that the CallerBuddySpec.md and design decisions in BACKLOG.md tend to be
  stable, but if we find during implementation that the specification or design
  decision has become questionable (it is causing ongoing grief) we should
  create a HIGH: priority task list item in BACKLOG.md to revisit this
  spec/design issue.

## Design Philosophy

- The overarching design philosophy is: simplicity, readability, testability and
  maintainability are top priorities. Minimalism is good, every framework has to
  justify its inclusion in the app, simple obvious code is best.
- High standards that people who make the
  [Modern Software Engineering](https://www.youtube.com/@ModernSoftwareEngineeringYT)
  would be in evidence.
- Ideally we spend very little time debugging.

## Design Decisions

As important design decision are made, they are logged here, optionally with a
rationale.

- CallerBuddy will be a PWA application.
  - This is because PWA apps give us the cross platform reach that we need we
    avoid the need to generate many binaries for the different platforms.
- We prefer TypeScript to JavaScript whenever possible.
- We may use a LIGHTWEIGHT UI framework like Lit (implementors choice) if its
  value can be justified. Otherwise use raw HTML5 / TypeScript.
- We will be Prettier for formatting. Code should confirm its defaults.
- We will be using Vite for building.
- We will be using Vitest for Unit testing.
- We will be using Playwright for UI testing.
- We will not be doing test driven development, but we will be front loading
  testing. features need good testing early and that should be part of
  developing the feature. If a bug was found AFTER testing (by users), part of
  the fix needs to be a test that exercises the behavior (and any related test
  hole).
- We will want an easy way of logging (maybe just browser console logging), with
  a way to turn it on during test runs, so that most bugs can be analyzed from
  just the logs and the asserts, logging should be light enough that it can be
  run during a test failure to get diagnostic information. Too much logging can
  be a problem, Ideally typical unit test runs produce less than 1000 lines of
  logging (hopefully less than 100).

## Open Design Issues

- [] Decide whether to use the Lit framework (and put the justification in the
  design decision section)
- [] Decide how to get the audio software that can modify tempo/pitch, and get
  it integrated into the code base.
- [] Decide on a logging strategy (do we use a logging package, which one?)

## Coding Standards

- Language best practices, including naming. We want the highest professional
  standards.
- We will be use ESLint to catch more errors at compile time. Issues found
  ESLint need to be fixed (or at least a bug logged in BACKLOG.md)
- assertions are to be used liberally. Pre and Post conditions on interfaces are
  strongly encouraged. They act as useful documentation. Expensive assertions
  (that are not constant time, or are on a very high frequency code path) may
  have to be commented out (but visible to coders for documentation purposes).
- Generally non-trivial methods on a class need documentation, however, only if
  you are providing information that could not be easily guessed by looking at
  the names of the method and its parameters. The return value needs to be
  documented if it is not obvious from the name of the method.
- Generally important non-local program invariants and the basic architecture
  between components need good documentation, typically at the start of a
  related file. Cross referencing (pointing the reader to documentation
  elsewhere in the code base), is good. Repeating is bad (reference instead).
- There should be an CodingBuddy object that represents the program as a whole,
  that gets created at start and dies when the program is closed. All global
  variables need to be justified, and no objects should 'leak' in the sense that
  the have outlived their usefulness (or will accumulate if the program runs a
  long time).
- Reuse: If there are GOOD QUALITY components (e.g. sound processing software)
  that exist on the web, or useful UI components they should be preferred IF
  THEY ADD ENOUGH VALUE (the work well, were well designed, and do not add large
  unnecessary bloat, and the alternative is a lot of locally written code) If
  there is any doubt, create a BACKLOG.md issue for it asking for a fix to the
  relevant design document.

## Features

- [] WHen the code is pretty complete, an analysis should be done locate any
  lifetime issues. Lifetime issues (e.g. potential leaks) need an explicit
  GitHub issue tracking the problem.
- [] Make sure ESLint is configured correctly.

## Bugs

## Questions/Clarifications.

- [x] HIGH: A Sample Question that is high priority
  - This is the Sample answer.
