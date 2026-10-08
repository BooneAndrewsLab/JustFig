# PDF fixtures for src/io/pdf (note 13), made with R 4 and ggplot2:
#   Rscript scripts/pdf-fixtures/r.R src/io/pdf/fixtures
args <- commandArgs(TRUE); out <- args[1]
pdf(file.path(out, "r-pdf.pdf"), width = 3.2, height = 2.6, compress = TRUE)
par(mar = c(4, 4, 2, 1))
x <- 1:10
plot(x, x^1.5, pch = 19, col = "#0072B2", xlab = "Dose (mg)", ylab = "Response", main = "Base R", ylim = c(0, 25))
lines(x, x * 2.2, lty = 2, col = "#D55E00", lwd = 2)
legend("topleft", c("obs", "fit"), pch = c(19, NA), lty = c(NA, 2), col = c("#0072B2", "#D55E00"), bty = "n")
dev.off()
library(ggplot2)
p <- ggplot(data.frame(g = c("ctrl", "drug A", "drug B"), v = c(4, 7, 5.5)), aes(g, v, fill = g)) +
  geom_col() + labs(x = "Treatment", y = "Expression", title = "ggplot2") + theme_bw(base_size = 9) +
  theme(legend.position = "none")
cairo_pdf(file.path(out, "r-cairo.pdf"), width = 3, height = 2.4)
print(p)
dev.off()
