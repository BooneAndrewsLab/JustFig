# Clip shapes and gradients (issue 25), made with R 4 and grid through pdf():
#   Rscript scripts/pdf-fixtures/r-gradient.R src/io/pdf/fixtures
# A viewport clipped to a circle (a clipping path, R >= 4.1), a rectangle filled with a linear
# gradient (an axial shading pattern) and a circle with a radial one.
args <- commandArgs(TRUE); out <- args[1]
library(grid)
f <- file.path(out, "r-gradient.pdf")
pdf(f, width = 3.2, height = 2.4)
grid.newpage()
pushViewport(viewport(x = 0.25, width = 0.45, height = 0.8, clip = circleGrob(r = 0.45)))
grid.rect(gp = gpar(fill = "grey85", col = NA))
grid.lines(c(0, 1), c(0.2, 0.9), gp = gpar(lwd = 3, col = "#0072b2"))
popViewport()
grid.rect(x = 0.75, y = 0.7, width = 0.4, height = 0.3,
          gp = gpar(fill = linearGradient(c("#0072b2", "#e69f00")), col = "black"))
grid.circle(x = 0.75, y = 0.25, r = 0.18, gp = gpar(fill = radialGradient(c("white", "#009e73"))))
dev.off()
# pdf() stamps the time: a fixed one (same length, so the offsets hold) keeps the file the same.
x <- readBin(f, "raw", file.size(f))
for (key in c("/CreationDate (D:", "/ModDate (D:")) {
  at <- grepRaw(key, x, fixed = TRUE) + nchar(key)
  x[at:(at + 13)] <- charToRaw("20000101000000")
}
writeBin(x, f)
