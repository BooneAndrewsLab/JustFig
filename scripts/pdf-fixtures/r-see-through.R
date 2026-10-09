# A see-through picture over ggplot2's grey panel and grid (issue 35), made with R 4 and
# ggplot2 through pdf(), like ggrastr's rasterized points:
#   Rscript scripts/pdf-fixtures/r-see-through.R src/io/pdf/fixtures
# annotation_raster draws an RGBA image (clear around its soft dots, a soft mask in the PDF) after
# the panel and its grid lines, over part of the panel: its clear pixels must show the grey
# and the grid lines, and the grid lines must not cross its dots.
args <- commandArgs(TRUE); out <- args[1]
library(ggplot2)
set.seed(1)
# Soft dots (alpha falling off from each centre): too detailed to become rectangles.
n <- 150
cx <- runif(80, 5, n - 5); cy <- runif(80, 5, n - 5)
g <- expand.grid(i = 1:n, j = 1:n)
d <- sqrt(apply(outer(g$i, cx, "-")^2 + outer(g$j, cy, "-")^2, 1, min))
img <- matrix(rgb(0, 0.45, 0.7, alpha = pmax(0, 1 - d / 3)), n, n)
p <- ggplot(data.frame(x = c(0, 10), y = c(0, 10)), aes(x, y)) +
  geom_blank() +
  annotation_raster(img, xmin = 2, xmax = 8, ymin = 2, ymax = 8, interpolate = FALSE) +
  labs(title = "See-through", x = "x", y = "y") +
  theme_grey(base_size = 9)
ggsave(file.path(out, "r-see-through.pdf"), p, width = 3.2, height = 2.4, device = "pdf")
# pdf() stamps the time: a fixed one (same length, so the offsets hold) keeps the file the same.
f <- file.path(out, "r-see-through.pdf")
x <- readBin(f, "raw", file.size(f))
for (key in c("/CreationDate (D:", "/ModDate (D:")) {
  at <- grepRaw(key, x, fixed = TRUE) + nchar(key)
  x[at:(at + 13)] <- charToRaw("20000101000000")
}
writeBin(x, f)
