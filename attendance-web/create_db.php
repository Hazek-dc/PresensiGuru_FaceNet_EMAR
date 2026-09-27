<?php
$pdo = new PDO('pgsql:host=127.0.0.1;port=5432', 'postgres', 'postgres');
$pdo->exec('CREATE DATABASE presensi_db');
echo "Database created.\n";
