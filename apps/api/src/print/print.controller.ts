import { Controller, Post, Body, Res } from '@nestjs/common'
import { Response } from 'express'
import * as bwipjs from 'bwip-js'

@Controller('print')
export class PrintController {
  @Post('labels')
  async generateLabels(@Body() body: any, @Res() res: Response) {

    const labels = Array.isArray(body?.print) ? body.print : []

    const html = await this.buildHtml(labels)

    res.setHeader('Content-Type', 'text/html')
    return res.send(html)
  }

  private async buildHtml(labels: any[]) {
    /**
     * Expande por quantity:
     * si una etiqueta tiene quantity 10, genera 10 etiquetas visuales iguales
     */

    //console.log(labels)
    const expandedLabels = labels.flatMap((label) => {
      const quantity = Number(label?.quantity || 0)

      if (quantity <= 0) return []

      return Array.from({ length: quantity }, () => ({
        title: label?.title || '',
        code: label?.code || '',
        variant_name: label?.variant_name || label?.variant || '',
      }))
    })

    /**
     * Cache simple para no regenerar el mismo barcode muchas veces
     */
    const barcodeCache = new Map<string, string>()

    const labelsHtmlArray = await Promise.all(
      expandedLabels.map(async (label) => {
        const code = String(label.code || '')
        let barcode = barcodeCache.get(code)

        if (!barcode) {
          barcode = await this.generateBarcodeBase64(code)
          barcodeCache.set(code, barcode)
        }

        return `
          <div class="label">
            <div class="title">${this.escapeHtml(label.title)}</div>

            <img src="${barcode}" class="barcode" />

            <div class="code">${this.escapeHtml(code)}</div>
            <div class="variant">${this.escapeHtml(label.variant_name)}</div>
          </div>
        `
      })
    )

    const labelsHtml = labelsHtmlArray.join('')

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Etiquetas</title>

      <style>
        @page {
          size: 150mm auto;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 4mm;
          font-family: Arial, sans-serif;
        }

        .sheet {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2mm;
        }

        .label {
          border: 1px solid #000;
          width: 48mm;
          height: 30mm;
          padding: 2mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          page-break-inside: avoid;
          overflow: hidden;
        }

        .title {
          font-size: 14px;
          font-weight: bold;
          text-align: center;
          line-height: 1.1;
          width: 100%;
        }

        .barcode {
          width: 100%;
          height: 12mm;
          object-fit: contain;
        }

        .code {
          font-size: 14px;
          line-height: 1;
          text-align: center;
        }

        .variant {
          font-size: 12px;
          font-weight: bold;
          text-align: center;
          line-height: 1.1;
          width: 100%;
        }
      </style>
    </head>

    <body>
      <div class="sheet">
        ${labelsHtml}
      </div>
    </body>
    </html>
    `
  }

  private async generateBarcodeBase64(code: string): Promise<string> {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: String(code),
      scale: 2,
      height: 10,
      includetext: false,
    })

    return `data:image/png;base64,${png.toString('base64')}`
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}