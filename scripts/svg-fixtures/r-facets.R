# SVG fixture for src/io/svg/plotResize.ts (note 17, issue 32): ggplot2 facets (strips above
# each panel, shared axis titles, a legend beside them) through R's svg() (cairo) device.
# Made with R 4.6 and ggplot2:
#   Rscript scripts/svg-fixtures/r-facets.R src/io/svg/fixtures/r-facets.svg
library(ggplot2)
out <- commandArgs(TRUE)[1]
d <- data.frame(
  dose = rep(1:6, 3),
  resp = c(1, 2, 2.5, 3.8, 4, 4.6, 0.5, 1, 1.2, 2, 2.2, 3, 2, 2.4, 3.6, 3.9, 5, 5.5),
  line = rep(c("WT", "KO", "Rescue"), each = 6),
  rep = rep(c("a", "b"), 9)
)
p <- ggplot(d, aes(dose, resp, colour = rep)) + geom_point(size = 1) +
  facet_wrap(~line) + labs(x = "Dose (mg)", y = "Response", colour = "Replicate") +
  theme_bw(base_size = 8)
svg(out, width = 5, height = 2.4)
print(p)
invisible(dev.off())
