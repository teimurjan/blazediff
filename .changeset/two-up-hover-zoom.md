---
"@blazediff/ui": minor
"@blazediff/react": minor
"@blazediff/agent": minor
---

Add a hover zoom to two-up mode, and a note-style review page in the agent.

`mountTwoUp` and `<TwoUpMode />` take a `zoom` magnification. When you hover
either image, a popup shows both images magnified at the same pixel. The popup
follows the pointer and flips at the viewport edges. The two-up engine gains
`hover` and `leave` actions and a `zoom` state field. The pure helpers
`toTwoUpHover`, `zoomPaneStyle` and `placeZoomPopup` are exported from
`@blazediff/ui/engine`.

`blazediff-agent review` is now a single page that reads like a note. Each
change has a view select for side by side (with the zoom), swipe and difference,
built from `@blazediff/react`. Decisions are saved when you finish the review.
