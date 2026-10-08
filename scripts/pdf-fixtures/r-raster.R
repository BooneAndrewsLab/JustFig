# A ggplot2 raster on its grey panel (issue 24), made with R 4 and ggplot2 through pdf():
#   Rscript scripts/pdf-fixtures/r-raster.R src/io/pdf/fixtures
# geom_raster(interpolate = TRUE) writes one smoothed image; the panel around it is bigger
# (ggplot2's axis expansion), so the import cuts a hole in the panel for the picture.
args <- commandArgs(TRUE); out <- args[1]
library(ggplot2)
d <- expand.grid(x = 1:12, y = 1:9)
d$z <- sin(d$x / 2) + cos(d$y / 3)
p <- ggplot(d, aes(x, y, fill = z)) +
  geom_raster(interpolate = TRUE) +
  scale_x_continuous(expand = c(0.1, 0)) +
  labs(title = "Raster", x = "Column", y = "Row") +
  theme_grey(base_size = 9)
ggsave(file.path(out, "r-raster.pdf"), p, width = 3.2, height = 2.4, device = "pdf")
# pdf() stamps the time: a fixed one (same length, so the offsets hold) keeps the file the same.
f <- file.path(out, "r-raster.pdf")
x <- readBin(f, "raw", file.size(f))
for (key in c("/CreationDate (D:", "/ModDate (D:")) {
  at <- grepRaw(key, x, fixed = TRUE) + nchar(key)
  x[at:(at + 13)] <- charToRaw("20000101000000")
}
writeBin(x, f)
