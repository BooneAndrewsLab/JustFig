# SVG fixture for src/io/svg/plotResize.ts (note 17, issue 39): ggplot2 facets that touch
# (`panel.spacing = unit(0, "pt")`) with one x axis line drawn along the whole row (added to the
# gtable across both panels, as a figure tweaked by hand), through R's svg() (cairo) device.
# Made with R 4.6 and ggplot2 4.0:
#   Rscript scripts/svg-fixtures/r-facets-joined.R src/io/svg/fixtures/r-facets-joined.svg
library(ggplot2)
library(grid)
out <- commandArgs(TRUE)[1]
d <- data.frame(
  dose = rep(1:6, 2),
  resp = c(1, 2, 2.5, 3.8, 4, 4.6, 0.5, 1, 1.2, 2, 2.2, 3),
  line = rep(c("WT", "KO"), each = 6)
)
p <- ggplot(d, aes(dose, resp)) + geom_point(size = 1) +
  facet_wrap(~line, nrow = 1) + labs(x = "Dose (mg)", y = "Response") +
  theme_classic(base_size = 8) +
  theme(panel.spacing = unit(0, "pt"), axis.line.x = element_blank())
svg(out, width = 4, height = 2.4)
g <- ggplotGrob(p)
panels <- g$layout[grepl("^panel", g$layout$name), ]
g <- gtable::gtable_add_grob(
  g, segmentsGrob(0, 0, 1, 0, gp = gpar(lwd = 1)),
  t = min(panels$t), l = min(panels$l), r = max(panels$r), z = Inf, clip = "off",
  name = "axis-line-x"
)
grid.draw(g)
invisible(dev.off())
