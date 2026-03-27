import { Controller, Post, Get, Body, Res } from '@nestjs/common'
import { Response } from 'express'
import * as bwipjs from 'bwip-js'

@Controller('print')
export class PrintController {
  @Post('labels')
  async generateLabels(@Body() body: any, @Res() res: Response) {
    const labels = Array.isArray(body?.print) ? body.print : []

    console.log('labels recibidos', labels)
    console.log(
      'total a imprimir',
      labels.reduce((acc, item) => acc + Number(item.quantity || 0), 0)
    )

    const html = await this.buildHtml(labels)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.send(html)
  }

  @Get('labels-preview')
  async previewLabels(@Res() res: Response) {
    const labels = [
      {
        title: 'PRODUCTO DEMO',
        code: '123456',
        variant_name: 'TALLA M',
        quantity: 1,
      },
      {
        title: 'OTRO PRODUCTO',
        code: '123455',
        variant_name: 'TALLA L',
        quantity: 2,
      },
      {
        title: 'OTRO PRODUCTO',
        code: '123459',
        variant_name: 'TALLA L',
        quantity: 3,
      },
    ]

    const html = await this.buildHtml(labels)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.send(html)
  }

  private async buildHtml(labels: any[]) {
    const expandedLabels = labels.flatMap((label) => {
      const quantity = Number(label?.quantity || 0)

      if (quantity <= 0) return []

      return Array.from({ length: quantity }, () => {
        const printedCode = String(label?.code || '').trim()
        const barcodeText = printedCode.includes(' - ')
          ? printedCode.split(' - ')[0].trim()
          : printedCode

        return {
          title: label?.title || '',
          code: printedCode,
          barcodeText,
          variant_name: label?.variant_name || label?.variant || '',
        }
      })
    })

    const barcodeCache = new Map<string, string>()

    const labelsHtmlArray = await Promise.all(
      expandedLabels.map(async (label) => {
        const code = String(label.code || '')
        const barcodeText = String(label.barcodeText || '')
        let barcode = barcodeCache.get(barcodeText)

        if (!barcode) {
          barcode = await this.generateBarcodeBase64(barcodeText)
          barcodeCache.set(barcodeText, barcode)
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

    const rows: string[] = []
    

    for (let i = 0; i < labelsHtmlArray.length; i += 3) {
      const col1 = labelsHtmlArray[i] || ''
      const col2 = labelsHtmlArray[i + 1] || ''
      const col3 = labelsHtmlArray[i + 2] || ''

      rows.push(`
        <tr>
          <td>${col1}</td>
          <td>${col2}</td>
          <td>${col3}</td>
        </tr>
      `)
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Etiquetas</title>

      <style>
        @page {
          size: 100mm auto;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          width: 100%;
          height: auto;
        }

        body {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 0;
        }

        .page {
          width: 101mm;
          margin: 0 auto;
          display: flex;
          justify-content: center;
        }

        table.sheet {
          width: 101mm;
          margin: 0 auto;
          border-collapse: collapse;
          border-spacing: 0;
          table-layout: fixed;
        }

        table.sheet td {
          width: 32mm;
          padding: 0;
          margin: 0;
          vertical-align: top;
          text-align: center;
        }

        .label {
          width: 32mm;
          height: 22mm;
          padding: 2.5px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          page-break-inside: avoid;
          margin: 0;
        }

        .title {
          font-size: 12px;
          font-weight: bold;
          text-align: center;
          width: 100%;
          line-height: 1.1;
          white-space: normal;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          word-break: break-word;
        }

        .barcode {
          display: block;
          width: 86px;
          height: 22px;
          margin: 0;
          image-rendering: pixelated;
        }

        .code {
          font-size: 10px;
          text-align: center;
          width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .variant {
          font-size: 8px;
          font-weight: bold;
          text-align: center;
          width: 100%;
          line-height: 1.1;
          max-height: 17.6px;
          white-space: normal;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          word-break: break-word;
        }
      </style>
    </head>

    <body>
      <div class="page">
        <table class="sheet">
          <tbody>
            ${rows.join('')}
          </tbody>
        </table>
      </div>
    </body>
    </html>
    `
  }

  private async generateBarcodeBase64(code: string): Promise<string> {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: String(code),
      scale: 3,
      height: 12,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
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