# Printer Socket Nest

Servidor básico NestJS + Socket.IO para recibir instrucciones de impresión.

## Instalación

```bash
npm install
npm run build
npm start
```

Modo desarrollo:

```bash
npm run start:dev
```

## Conexión

Namespace: `/printer`

URL local:
```
http://localhost:3000/printer
```

## Evento

### Emitir

Evento: `printer:listen`

Payload:

```json
{
  "deviceId": "printer-pos-001",
  "printerName": "Digital POS DG-2406T PRO",
  "type": "label",
  "template": {
    "name": "product-label"
  },
  "dataset": [
    {
      "title": "PRODUCTO DEMO"
    }
  ]
}
```

### Respuesta

Evento: `printer:ack`
