# SVG fixture for src/io/svg/plotResize.ts (note 17, issue 34): ggplot2 facets that touch
# (`panel.spacing = unit(0, "pt")`), each with its own border, through R's svg() (cairo) device.
# Made with R 4.6 and ggplot2 4.0:
#   Rscript scripts/svg-fixtures/r-facets-touching.R src/io/svg/fixtures/r-facets-touching.svg
library(ggplot2)
out <- commandArgs(TRUE)[1]
d <- data.frame(
  dose = rep(1:6, 4),
  resp = c(1, 2, 2.5, 3.8, 4, 4.6, 0.5, 1, 1.2, 2, 2.2, 3, 2, 2.4, 3.6, 3.9, 5, 5.5,
           1.5, 1.8, 2.9, 3.1, 3.3, 4.2),
  line = rep(c("WT", "KO", "Rescue", "Mock"), each = 6)
)
p <- ggplot(d, aes(dose, resp)) + geom_point(size = 1) +
  facet_wrap(~line, nrow = 2) + labs(x = "Dose (mg)", y = "Response") +
  theme_bw(base_size = 8) + theme(panel.spacing = unit(0, "pt"))
svg(out, width = 4, height = 3.2)
print(p)
invisible(dev.off())
