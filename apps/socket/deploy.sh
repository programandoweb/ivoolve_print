#!/bin/bash

# Asegúrate de que el script se ejecute con permisos de superusuario
if [ "$EUID" -ne 0 ]; then 
  echo "Por favor, ejecute el script como root"
  exit 1
fi

echo "Ejecutando docker system prune -a..."
docker system prune -a -f

echo "Dando permisos de ejecución al script..."
chmod +x start.sh

echo "Ejecutando npm run build..."
npm run build

echo "Construyendo la imagen Docker..."
sudo docker build -t programandoweb/evolve:front-landing-inventory .

echo "Pusheando la imagen al repositorio Docker..."
sudo docker push programandoweb/evolve:front-landing-inventory

echo "Deteniendo el contenedor anterior si está corriendo..."
sudo docker stop front-landing-inventory || true

echo "Eliminando el contenedor anterior si existe..."
sudo docker rm front-landing-inventory || true

echo "Desplegando el nuevo contenedor..."
sudo docker run -d --name front-landing-inventory -p 6001:3000 --restart=always programandoweb/evolve:front-landing-inventory

echo "Reiniciando el servicio de MariaDB..."
sudo systemctl restart mariadb

echo "Despliegue completado exitosamente."
