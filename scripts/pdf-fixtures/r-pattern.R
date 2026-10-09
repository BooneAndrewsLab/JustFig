# Pattern fills (issue 37), made with R 4 and grid through pdf():
#   Rscript scripts/pdf-fixtures/r-pattern.R src/io/pdf/fixtures
# A rectangle filled with a repeating pattern of a diagonal line (a tiling pattern, R >= 4.1),
# and a circle filled with a repeating pattern of dots over a rotated cell.
args <- commandArgs(TRUE); out <- args[1]
library(grid)
f <- file.path(out, "r-pattern.pdf")
pdf(f, width = 3.2, height = 2.4)
grid.newpage()
hatch <- pattern(segmentsGrob(0, 0, 1, 1, gp = gpar(col = "#d55e00", lwd = 1.5)),
                 width = unit(4, "mm"), height = unit(4, "mm"), extend = "repeat")
grid.rect(x = 0.28, width = 0.4, height = 0.7, gp = gpar(fill = hatch, col = "black"))
dots <- pattern(circleGrob(r = unit(0.6, "mm"), gp = gpar(fill = "#0072b2", col = NA)),
                width = unit(3, "mm"), height = unit(3, "mm"), extend = "repeat")
pushViewport(viewport(x = 0.75, angle = 30))
grid.circle(r = 0.3, gp = gpar(fill = dots, col = "black"))
popViewport()
dev.off()
# pdf() stamps the time: a fixed one (same length, so the offsets hold) keeps the file the same.
x <- readBin(f, "raw", file.size(f))
for (key in c("/CreationDate (D:", "/ModDate (D:")) {
  at <- grepRaw(key, x, fixed = TRUE) + nchar(key)
  x[at:(at + 13)] <- charToRaw("20000101000000")
}
writeBin(x, f)
