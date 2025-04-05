-- Drop database if exists and create new one
DROP DATABASE IF EXISTS manage_system_db;
CREATE DATABASE manage_system_db;

-- Use the database
USE manage_system_db;

-- Drop tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS permission_requests;
DROP TABLE IF EXISTS role_privileges;
DROP TABLE IF EXISTS privilege;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS company;
DROP TABLE IF EXISTS addresses;

-- Create addresses table
CREATE TABLE IF NOT EXISTS addresses (
    address_id INT PRIMARY KEY AUTO_INCREMENT,
    line_address_1 VARCHAR(255) NOT NULL,
    line_address_2 VARCHAR(255),
    line_address_3 VARCHAR(255),
    line_address_4 VARCHAR(255),
    county VARCHAR(50),
    city VARCHAR(50),
    postcode VARCHAR(10),
    address_type_1 VARCHAR(20),
    address_type_2 VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    column_1 VARCHAR(100),
    column_2 VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for better performance
CREATE INDEX idx_postcode ON addresses(postcode);
CREATE INDEX idx_city ON addresses(city);
CREATE INDEX idx_county ON addresses(county);

-- Add comments for documentation
ALTER TABLE addresses
    COMMENT 'Table storing address information with multiple address lines and types';

-- Create user and grant privileges (replace with your desired username and password)
-- CREATE USER 'manage_system_user'@'localhost' IDENTIFIED BY 'your_password';
-- GRANT ALL PRIVILEGES ON manage_system_db.* TO 'manage_system_user'@'localhost';
-- FLUSH PRIVILEGES;

-- Show table structure
DESCRIBE addresses;

-- Show indexes
SHOW INDEX FROM addresses;

-- Create company table
CREATE TABLE IF NOT EXISTS company (
    company_id INT PRIMARY KEY AUTO_INCREMENT,
    c_name VARCHAR(255) NOT NULL,
    c_logo VARCHAR(255),
    reg_id VARCHAR(100),
    contact_1 VARCHAR(15),
    contact_2 VARCHAR(15),
    email_1 VARCHAR(100),
    email_2 VARCHAR(100),
    address_id INT,
    billing_address INT,
    column_1 VARCHAR(100),
    column_2 VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (address_id) REFERENCES addresses(address_id) ON DELETE CASCADE,
    FOREIGN KEY (billing_address) REFERENCES addresses(address_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for better performance
CREATE INDEX idx_company_name ON company(c_name);
CREATE INDEX idx_reg_id ON company(reg_id);
CREATE INDEX idx_email_1 ON company(email_1);

-- Add comments for documentation
ALTER TABLE company
    COMMENT 'Table storing company information with address relationships';

-- Show table structure
DESCRIBE company;

-- Show indexes
SHOW INDEX FROM company;

-- Create branch table
CREATE TABLE IF NOT EXISTS branches (
    branch_id INT PRIMARY KEY AUTO_INCREMENT,
    b_name VARCHAR(255) NOT NULL,
    contact_1 VARCHAR(15),
    contact_2 VARCHAR(15),
    email_1 VARCHAR(100),
    email_2 VARCHAR(100),
    address_id INT,
    billing_address INT,
    column_1 VARCHAR(100),
    column_2 VARCHAR(100),
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (address_id) REFERENCES addresses(address_id) ON DELETE CASCADE,
    FOREIGN KEY (billing_address) REFERENCES addresses(address_id) ON DELETE SET NULL,
    FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for better performance
CREATE INDEX idx_branch_name ON branches(b_name);
CREATE INDEX idx_branch_email ON branches(email_1);

-- Add comments for documentation
ALTER TABLE branches
    COMMENT 'Table storing branch information with address relationships';

-- Show table structure
DESCRIBE branches;

-- Show indexes
SHOW INDEX FROM branches;

-- Create role table
CREATE TABLE IF NOT EXISTS roles (
    role_id INT PRIMARY KEY AUTO_INCREMENT,
    role_name VARCHAR(50) NOT NULL,
    for_company INT,
    for_branch INT,
    column_1 VARCHAR(100),
    column_2 VARCHAR(100),
    column_3 VARCHAR(100),
    role_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (for_company) REFERENCES company(company_id) ON DELETE CASCADE,
    FOREIGN KEY (for_branch) REFERENCES branches(branch_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comments for documentation
ALTER TABLE roles
    COMMENT 'Table storing role information with company and branch relationships';

-- Show table structure
DESCRIBE roles;

-- Show indexes
SHOW INDEX FROM roles;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role INT,
    branch_id INT,
    company_id INT,
    u_status VARCHAR(10),
    column_1 VARCHAR(100),
    column_2 VARCHAR(100),
    column_3 VARCHAR(100),
    assigned_by INT,
    revoked_by INT,
    assigned_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role) REFERENCES roles(role_id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE SET NULL,
    FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for users table
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_display_name ON users(display_name);
CREATE INDEX idx_user_branch ON users(branch_id);
CREATE INDEX idx_user_company ON users(company_id);

-- Add comments for documentation
ALTER TABLE users
    COMMENT 'Table storing user information with role, branch, and company relationships';

-- Show table structure
DESCRIBE users;

-- Show indexes
SHOW INDEX FROM users;

-- Create privilege table
CREATE TABLE IF NOT EXISTS privilege (
    privilege_id INT PRIMARY KEY AUTO_INCREMENT,
    p_name VARCHAR(100) NOT NULL,
    column_1 VARCHAR(50),
    column_2 VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comments for documentation
ALTER TABLE privilege
    COMMENT 'Table storing privilege information';

-- Show table structure
DESCRIBE privilege;

-- Show indexes
SHOW INDEX FROM privilege;


-- Create role_privileges table (junction table)
CREATE TABLE IF NOT EXISTS role_privileges (
    role_id INT,
    privilege_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, privilege_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (privilege_id) REFERENCES privilege(privilege_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for role_privileges table
CREATE INDEX idx_role_privilege_role ON role_privileges(role_id);
CREATE INDEX idx_role_privilege_privilege ON role_privileges(privilege_id);

-- Add comments for role_privileges table
ALTER TABLE role_privileges
    COMMENT 'Junction table storing role-privilege relationships';


-- Show table structure
DESCRIBE role_privileges;

-- Show indexes
SHOW INDEX FROM role_privileges; 


-- Create permission_requests table
CREATE TABLE IF NOT EXISTS permission_requests (
    request_id INT PRIMARY KEY AUTO_INCREMENT,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role INT,
    branch_id INT,
    company_id INT,
    u_status VARCHAR(10),
    column_1 VARCHAR(100),
    column_2 VARCHAR(100),
    column_3 VARCHAR(100),
    assigned_by INT,
    approved_by INT,
    approved_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rejected_by INT,
    rejected_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role) REFERENCES roles(role_id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE SET NULL,
    FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (rejected_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for permission_requests table
CREATE INDEX idx_request_email ON permission_requests(email);
CREATE INDEX idx_request_display_name ON permission_requests(display_name);
CREATE INDEX idx_request_approved_by ON permission_requests(approved_by);
CREATE INDEX idx_request_branch ON permission_requests(branch_id);
CREATE INDEX idx_request_company ON permission_requests(company_id);

-- Add comments for permission_requests table
ALTER TABLE permission_requests
    COMMENT 'Table storing permission request information with approval tracking, branch, and company relationships';

-- Show table structure
DESCRIBE permission_requests;

-- Show indexes
SHOW INDEX FROM permission_requests; 