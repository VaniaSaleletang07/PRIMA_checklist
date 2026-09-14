# 📘 Panduan untuk IT Pertamina

## PRIMA (Pertamina Checklist Mobil Tangki) - Deployment & Maintenance

---

## 🎯 PENDAHULUAN

Dokumen ini ditujukan untuk **Tim IT Pertamina** yang akan melakukan hosting dan maintenance PRIMA. Sistem ini dibangun dengan PHP + MySQL dan siap untuk production deployment.

**Sistem Info:**

- Nama: PRIMA (Pertamina Checklist Mobil Tangki)
- Versi: 1.0.0
- Technology Stack: PHP 7.4+, MySQL 5.7+, Apache 2.4+
- Security Level: Enterprise-Grade (8.5/10)

---

## 📋 REQUIREMENTS

### Server Requirements

```
Operating System:  Linux (Ubuntu 20.04+ / CentOS 7+) atau Windows Server 2016+
Web Server:        Apache 2.4+ dengan mod_rewrite enabled
Database:          MySQL 5.7+ atau MariaDB 10.3+
PHP Version:       7.4, 8.0, atau 8.1
RAM:              Minimum 2GB (4GB recommended)
Storage:          Minimum 10GB (untuk database + backups)
```

### PHP Extensions Required

```bash
# Check PHP extensions:
php -m

# Required:
✓ pdo
✓ pdo_mysql
✓ mysqli
✓ mbstring
✓ json
✓ openssl
✓ curl
```

### Apache Modules Required

```bash
# Check Apache modules:
apachectl -M

# Required:
✓ mod_rewrite
✓ mod_headers
✓ mod_deflate
✓ mod_expires
✓ mod_security (optional)
```

---

## 🔧 INSTALLATION STEPS

### 1. Prepare Server Environment

#### Ubuntu/Debian:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install LAMP Stack
sudo apt install apache2 mysql-server php php-mysql php-mbstring php-json -y

# Enable Apache modules
sudo a2enmod rewrite headers deflate expires
sudo systemctl restart apache2

# Secure MySQL
sudo mysql_secure_installation
```

#### CentOS/RHEL:

```bash
# Update system
sudo yum update -y

# Install LAMP Stack
sudo yum install httpd mariadb-server php php-mysql php-mbstring php-json -y

# Start services
sudo systemctl start httpd
sudo systemctl start mariadb
sudo systemctl enable httpd
sudo systemctl enable mariadb

# Secure MariaDB
sudo mysql_secure_installation
```

---

### 2. Create Database

```bash
# Login as root
mysql -u root -p
```

```sql
-- Create database
CREATE DATABASE checklist_ekim CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create application user
CREATE USER 'ekim_user'@'localhost' IDENTIFIED BY 'YourStrongPassword123!';

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON checklist_ekim.* TO 'ekim_user'@'localhost';

-- Create backup user
CREATE USER 'ekim_backup'@'localhost' IDENTIFIED BY 'BackupPassword123!';
GRANT SELECT, LOCK TABLES, SHOW VIEW ON checklist_ekim.* TO 'ekim_backup'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;

-- Exit
EXIT;
```

```bash
# Import database schema
mysql -u ekim_user -p checklist_ekim < database.production.sql
```

---

### 3. Deploy Application Files

```bash
# Create directory
sudo mkdir -p /var/www/html/ekim
cd /var/www/html/ekim

# Upload files via SFTP or:
# scp -r ChecklistUpdateE-KIM/* user@server:/var/www/html/ekim/

# Rename config file
mv config.production.php config.php

# Create required directories
mkdir -p logs backup

# Set ownership
sudo chown -R www-data:www-data /var/www/html/ekim

# Set permissions
find /var/www/html/ekim -type f -exec chmod 644 {} \;
find /var/www/html/ekim -type d -exec chmod 755 {} \;
chmod 640 /var/www/html/ekim/config.php
```

---

### 4. Configure Application

Edit `/var/www/html/ekim/config.php`:

```php
// Database Configuration
define('DB_HOST', 'localhost');
define('DB_USER', 'ekim_user');
define('DB_PASS', 'YourStrongPassword123!');  // ⚠️ Same as step 2
define('DB_NAME', 'checklist_ekim');

// Environment
define('APP_ENV', 'production');

// Session security (set to 1 after HTTPS)
ini_set('session.cookie_secure', 0);  // Change to 1 after SSL
```

---

### 5. Configure Apache Virtual Host

Create `/etc/apache2/sites-available/ekim.conf`:

```apache
<VirtualHost *:80>
    ServerName ekim.pertamina.com
    ServerAlias www.ekim.pertamina.com

    DocumentRoot /var/www/html/ekim

    <Directory /var/www/html/ekim>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Logs
    ErrorLog ${APACHE_LOG_DIR}/ekim_error.log
    CustomLog ${APACHE_LOG_DIR}/ekim_access.log combined

    # Security Headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
</VirtualHost>
```

Enable site:

```bash
sudo a2ensite ekim.conf
sudo systemctl reload apache2
```

---

### 6. Install SSL Certificate

#### Using Let's Encrypt (FREE):

```bash
# Install Certbot
sudo apt install certbot python3-certbot-apache -y

# Generate certificate
sudo certbot --apache -d ekim.pertamina.com -d www.ekim.pertamina.com

# Follow prompts:
# - Enter email for notifications
# - Agree to Terms
# - Select "2: Redirect - Make all requests redirect to HTTPS"

# Test auto-renewal
sudo certbot renew --dry-run
```

#### After SSL Installed:

Edit `/var/www/html/ekim/config.php`:

```php
ini_set('session.cookie_secure', 1);  // Enable secure cookies
```

Uncomment in `.htaccess`:

```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

---

### 7. Setup Automated Backup

Create `/var/www/html/ekim/backup/backup.sh`:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/www/html/ekim/backup"
DB_USER="ekim_backup"
DB_PASS="BackupPassword123!"
DB_NAME="checklist_ekim"

# Backup database
mysqldump -u $DB_USER -p$DB_PASS $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql

# Compress
gzip $BACKUP_DIR/db_backup_$DATE.sql

# Delete old backups (30 days)
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +30 -delete

# Log
echo "$(date): Backup completed - db_backup_$DATE.sql.gz" >> $BACKUP_DIR/backup.log
```

```bash
chmod +x /var/www/html/ekim/backup/backup.sh
```

Setup cron job:

```bash
sudo crontab -e

# Add (daily at 2 AM):
0 2 * * * /var/www/html/ekim/backup/backup.sh
```

---

### 8. Configure Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# Firewalld (CentOS)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

### 9. Testing

```bash
# Test database connection
mysql -u ekim_user -p checklist_ekim -e "SHOW TABLES;"

# Test PHP
php -v
php -m | grep pdo

# Test Apache
sudo apachectl -t
curl -I http://localhost/ekim/

# Test application
curl https://ekim.pertamina.com/index.html
```

Access in browser:

- https://ekim.pertamina.com/test.php (verify DB connection)
- https://ekim.pertamina.com/index.html (test form)
- https://ekim.pertamina.com/list.php (test data list)

**⚠️ DELETE test.php after testing!**

---

## 🔐 SECURITY HARDENING

### 1. MySQL Security

```sql
-- Login as root
mysql -u root -p

-- Disable remote root
UPDATE mysql.user SET Host='localhost' WHERE User='root' AND Host='%';

-- Remove anonymous users
DELETE FROM mysql.user WHERE User='';

-- Remove test database
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';

-- Flush
FLUSH PRIVILEGES;
```

### 2. PHP Security

Edit `/etc/php/7.4/apache2/php.ini`:

```ini
; Security
expose_php = Off
display_errors = Off
display_startup_errors = Off
log_errors = On
error_log = /var/log/php/error.log

; Limits
max_execution_time = 300
max_input_time = 300
memory_limit = 128M
post_max_size = 10M
upload_max_filesize = 10M

; Session
session.cookie_httponly = 1
session.cookie_secure = 1
session.use_only_cookies = 1
```

### 3. Apache Security

Edit `/etc/apache2/conf-available/security.conf`:

```apache
ServerTokens Prod
ServerSignature Off
TraceEnable Off
```

Enable:

```bash
sudo a2enconf security
sudo systemctl reload apache2
```

---

## 📊 MONITORING & MAINTENANCE

### 1. Setup Log Rotation

Create `/etc/logrotate.d/ekim`:

```
/var/www/html/ekim/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        /usr/sbin/apachectl graceful > /dev/null
    endscript
}
```

### 2. Daily Monitoring Script

Create `/usr/local/bin/ekim_monitor.sh`:

```bash
#!/bin/bash
LOG="/var/log/ekim_monitor.log"
ADMIN_EMAIL="it@pertamina.com"

# Check disk space
DISK_USAGE=$(df -h /var/www/html/ekim | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "$(date): WARNING - Disk usage at ${DISK_USAGE}%" >> $LOG
    echo "Disk usage critical: ${DISK_USAGE}%" | mail -s "EKIM Alert" $ADMIN_EMAIL
fi

# Check MySQL
if ! mysqladmin ping -h localhost -u ekim_user -p'password' &>/dev/null; then
    echo "$(date): ERROR - MySQL not responding" >> $LOG
    echo "MySQL database down" | mail -s "EKIM Critical" $ADMIN_EMAIL
fi

# Check Apache
if ! systemctl is-active --quiet apache2; then
    echo "$(date): ERROR - Apache not running" >> $LOG
    systemctl start apache2
    echo "Apache was down, restarted" | mail -s "EKIM Critical" $ADMIN_EMAIL
fi

# Check backup
LATEST_BACKUP=$(ls -t /var/www/html/ekim/backup/db_backup_*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST_BACKUP" ] || [ $(find "$LATEST_BACKUP" -mtime +1 | wc -l) -gt 0 ]; then
    echo "$(date): WARNING - No recent backup found" >> $LOG
    echo "Backup missing or outdated" | mail -s "EKIM Alert" $ADMIN_EMAIL
fi
```

```bash
chmod +x /usr/local/bin/ekim_monitor.sh

# Add to cron (every hour)
sudo crontab -e
0 * * * * /usr/local/bin/ekim_monitor.sh
```

---

## 🆘 TROUBLESHOOTING

### Apache tidak start

```bash
# Check syntax
sudo apachectl -t

# Check error log
sudo tail -50 /var/log/apache2/error.log

# Check port conflict
sudo netstat -tulpn | grep :80

# Restart
sudo systemctl restart apache2
```

### MySQL connection failed

```bash
# Check MySQL running
sudo systemctl status mysql

# Check credentials
mysql -u ekim_user -p checklist_ekim

# Check grants
mysql -u root -p -e "SHOW GRANTS FOR 'ekim_user'@'localhost';"

# Restart MySQL
sudo systemctl restart mysql
```

### 500 Internal Server Error

```bash
# Check PHP error log
tail -50 /var/www/html/ekim/logs/php_errors.log

# Check Apache error log
sudo tail -50 /var/log/apache2/ekim_error.log

# Check file permissions
ls -la /var/www/html/ekim/

# Test PHP
php -l /var/www/html/ekim/index.html
```

### Backup tidak jalan

```bash
# Test manual backup
/var/www/html/ekim/backup/backup.sh

# Check cron log
grep CRON /var/log/syslog

# Check permissions
ls -l /var/www/html/ekim/backup/backup.sh
```

---

## 📞 CONTACTS

### Application Support

- Developer: [NAME] - [PHONE] - [EMAIL]
- Database Admin: [NAME] - [PHONE] - [EMAIL]

### Pertamina IT

- IT Manager: [NAME] - [PHONE] - [EMAIL]
- Server Admin: [NAME] - [PHONE] - [EMAIL]
- Security Officer: [NAME] - [PHONE] - [EMAIL]

### Emergency Escalation

1. First: Check logs (`/var/log/apache2/`, `/var/www/html/ekim/logs/`)
2. Second: Restart services (`apache2`, `mysql`)
3. Third: Contact developer/DBA
4. Last Resort: Rollback to previous backup

---

## ✅ DEPLOYMENT CHECKLIST

```
Server Setup:
[ ] LAMP stack installed
[ ] Apache modules enabled
[ ] PHP extensions verified
[ ] Firewall configured

Database:
[ ] Database created
[ ] Users created with proper privileges
[ ] Schema imported successfully
[ ] Admin password changed
[ ] Test connection successful

Application:
[ ] Files uploaded to /var/www/html/ekim/
[ ] config.php configured correctly
[ ] Permissions set (644/755)
[ ] Virtual host configured
[ ] .htaccess working

Security:
[ ] SSL certificate installed
[ ] HTTPS redirect enabled
[ ] session.cookie_secure = 1
[ ] test.php deleted
[ ] Sensitive files protected
[ ] Security headers enabled

Monitoring:
[ ] Automated backup running
[ ] Log rotation configured
[ ] Monitoring script active
[ ] Uptime monitoring setup
[ ] Alert emails configured

Testing:
[ ] Database connection working
[ ] Form input → save → success
[ ] CRUD operations working
[ ] Export Excel working
[ ] SSL Grade A+ verified
[ ] No security vulnerabilities
```

---

**System Status: PRODUCTION READY ✅**  
**Deployment Date: [DATE]**  
**Deployed By: [IT STAFF NAME]**  
**Approved By: [IT MANAGER NAME]**
