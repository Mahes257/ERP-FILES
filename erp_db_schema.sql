-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: erp_db
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `acknowledgements`
--

DROP TABLE IF EXISTS `acknowledgements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `acknowledgements` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `acknowledged_by` varchar(255) DEFAULT NULL,
  `acknowledgement_datetime` datetime(6) DEFAULT NULL,
  `production_order_number` varchar(50) DEFAULT NULL,
  `remarks` text,
  `status` varchar(30) DEFAULT NULL,
  `work_order_id` varchar(20) NOT NULL,
  `work_order_number` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `app_settings`
--

DROP TABLE IF EXISTS `app_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_settings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `setting_key` varchar(60) NOT NULL,
  `setting_value` varchar(120) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK7p82g7l6uve2vd8l30djhxpel` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `approval_history`
--

DROP TABLE IF EXISTS `approval_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `from_status` enum('ADMIN_APPROVED','ADMIN_REJECTED','APPROVED','CANCELLED','COMPLETED','DISPATCHED','DRAFT','FAILED','HOLD','IN_PROGRESS','PACKED','PENDING','PENDING_ADMIN_APPROVAL','PENDING_PRODUCTION_APPROVAL','PENDING_QC','PRODUCTION_APPROVED','PRODUCTION_REJECTED','READY_FOR_DISPATCH') DEFAULT NULL,
  `performed_at` datetime(6) NOT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `remarks` text,
  `to_status` enum('ADMIN_APPROVED','ADMIN_REJECTED','APPROVED','CANCELLED','COMPLETED','DISPATCHED','DRAFT','FAILED','HOLD','IN_PROGRESS','PACKED','PENDING','PENDING_ADMIN_APPROVAL','PENDING_PRODUCTION_APPROVAL','PENDING_QC','PRODUCTION_APPROVED','PRODUCTION_REJECTED','READY_FOR_DISPATCH') NOT NULL,
  `production_order_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKr994a1vnjgyeo8jxw8nogf2bg` (`production_order_id`),
  CONSTRAINT `FKr994a1vnjgyeo8jxw8nogf2bg` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `attachment_storage_usage`
--

DROP TABLE IF EXISTS `attachment_storage_usage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attachment_storage_usage` (
  `id` bigint NOT NULL,
  `total_bytes` bigint NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `action` enum('APPROVE','CANCEL','COMPLETE','CREATE','DELETE','DELIVER','DISPATCH','FAILED_LOGIN','FILE_DOWNLOAD','FILE_UPLOAD','HOLD','LOGIN','LOGOUT','REJECT','RESUME','SKIP','START','STATUS_CHANGE','SUBMIT','UPDATE','VERIFY') NOT NULL,
  `description` text,
  `entity_display_id` varchar(255) DEFAULT NULL,
  `entity_id` varchar(100) DEFAULT NULL,
  `entity_type` varchar(100) NOT NULL,
  `ip_address` varchar(100) DEFAULT NULL,
  `module` enum('ASSEMBLY','AUTHENTICATION','CASTING','DISPATCH','DRAWING','FABRICATION','MODEL','PACKING','PRODUCTION','PURCHASE','QUALITY','REPORTS','SALES','SETTINGS','SYSTEM','TECHNICAL_VERIFICATION') NOT NULL,
  `new_value` json DEFAULT NULL,
  `old_value` json DEFAULT NULL,
  `request_id` varchar(100) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user_id` (`user_id`),
  KEY `idx_audit_module` (`module`),
  KEY `idx_audit_entity_type` (`entity_type`),
  KEY `idx_audit_entity_id` (`entity_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created_at` (`created_at`),
  KEY `idx_audit_module_entity` (`module`,`entity_type`,`entity_id`),
  KEY `idx_audit_user_module` (`user_id`,`module`)
) ENGINE=InnoDB AUTO_INCREMENT=111 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auto_number_sequences`
--

DROP TABLE IF EXISTS `auto_number_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auto_number_sequences` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `module` varchar(40) NOT NULL,
  `prefix` varchar(40) NOT NULL,
  `current_value` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_module` (`module`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clients`
--

DROP TABLE IF EXISTS `clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clients` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `address` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `deleted_at` datetime(6) DEFAULT NULL,
  `designation` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `internal_notes` text,
  `name` varchar(190) NOT NULL,
  `owner` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `pincode` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` enum('ACTIVE','ARCHIVED','DELETED','INACTIVE') NOT NULL,
  `tax_id` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `value` decimal(18,2) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `client_no` varchar(40) DEFAULT NULL,
  `account_holder_name` varchar(255) DEFAULT NULL,
  `account_number` varchar(255) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `client_type` varchar(255) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `ifsc_code` varchar(255) DEFAULT NULL,
  `opening_balance` decimal(18,2) DEFAULT NULL,
  `pan_number` varchar(255) DEFAULT NULL,
  `tax_treatment` varchar(255) DEFAULT NULL,
  `upi_id` varchar(255) DEFAULT NULL,
  `alias` varchar(255) DEFAULT NULL,
  `category` varchar(255) DEFAULT NULL,
  `credit_limit` decimal(18,2) DEFAULT NULL,
  `currency` varchar(12) DEFAULT NULL,
  `linked_contacts` text,
  `map_no` varchar(255) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `shipping_details` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK3jhwvb7me5po3ohyu5iv2y1s9` (`client_no`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cost_workout_categories`
--

DROP TABLE IF EXISTS `cost_workout_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cost_workout_categories` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `amount` decimal(18,2) DEFAULT NULL,
  `category` varchar(255) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  `item_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKcqvusjuxkjaqrf3tk2ftw0rbd` (`item_id`),
  CONSTRAINT `FKcqvusjuxkjaqrf3tk2ftw0rbd` FOREIGN KEY (`item_id`) REFERENCES `cost_workout_items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cost_workout_items`
--

DROP TABLE IF EXISTS `cost_workout_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cost_workout_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` text,
  `qty` decimal(18,3) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  `cost_workout_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK8ixqbuw0g0o5253gdarnvqipx` (`cost_workout_id`),
  CONSTRAINT `FK8ixqbuw0g0o5253gdarnvqipx` FOREIGN KEY (`cost_workout_id`) REFERENCES `cost_workouts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cost_workout_timeline`
--

DROP TABLE IF EXISTS `cost_workout_timeline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cost_workout_timeline` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `detail` text,
  `title` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `cost_workout_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKjd5qfc9igdgld53wxpatobw72` (`cost_workout_id`),
  CONSTRAINT `FKjd5qfc9igdgld53wxpatobw72` FOREIGN KEY (`cost_workout_id`) REFERENCES `cost_workouts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cost_workouts`
--

DROP TABLE IF EXISTS `cost_workouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cost_workouts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `approved_by` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `attachments_json` longtext,
  `billing_address` text,
  `company` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `cpr_ref` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `cw_date` datetime(6) DEFAULT NULL,
  `cw_no` varchar(40) NOT NULL,
  `department` varchar(255) DEFAULT NULL,
  `discount_amt` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(10,2) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gst` varchar(255) DEFAULT NULL,
  `gst_amt` decimal(18,2) DEFAULT NULL,
  `gst_pct` decimal(10,2) DEFAULT NULL,
  `linked_cpr` varchar(255) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `prepared_by` varchar(255) DEFAULT NULL,
  `profit_amt` decimal(18,2) DEFAULT NULL,
  `profit_pct` decimal(10,2) DEFAULT NULL,
  `rejection_reason` text,
  `remarks` text,
  `selling_price` decimal(18,2) DEFAULT NULL,
  `shipping_address` text,
  `source_lead` varchar(255) DEFAULT NULL,
  `status` enum('APPROVED','ARCHIVED','COMPLETED','DELETED','DRAFT','REJECTED','SUBMITTED') NOT NULL,
  `subtotal` decimal(18,2) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `cpr_id` bigint DEFAULT NULL,
  `converted_to_pw` varchar(255) DEFAULT NULL,
  `converted_to_pw_id` bigint DEFAULT NULL,
  `converted_to_qtn` varchar(255) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKh42cx6vnfrurnytrc3l7sib5m` (`cw_no`),
  KEY `FKd8tgk7yipkli1nn0jjjekhvy1` (`cpr_id`),
  CONSTRAINT `FKd8tgk7yipkli1nn0jjjekhvy1` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_attachments`
--

DROP TABLE IF EXISTS `cpr_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `cpr_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK1nnsr6t28lqt7li6ewn2wnbay` (`cpr_id`),
  CONSTRAINT `FK1nnsr6t28lqt7li6ewn2wnbay` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_comments`
--

DROP TABLE IF EXISTS `cpr_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_comments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `author` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `text` text,
  `updated_at` datetime(6) DEFAULT NULL,
  `cpr_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKjilfacv28ssmvybydqj8xlif8` (`cpr_id`),
  CONSTRAINT `FKjilfacv28ssmvybydqj8xlif8` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_history`
--

DROP TABLE IF EXISTS `cpr_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `changed_by` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `field` varchar(255) DEFAULT NULL,
  `new_value` text,
  `old_value` text,
  `cpr_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKlrm1nl8x1tr41yuikcb6arklj` (`cpr_id`),
  CONSTRAINT `FKlrm1nl8x1tr41yuikcb6arklj` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_items`
--

DROP TABLE IF EXISTS `cpr_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` text,
  `drawing_no` varchar(255) DEFAULT NULL,
  `estimated_cost` decimal(18,2) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_size` bigint NOT NULL,
  `file_type` varchar(255) DEFAULT NULL,
  `qty` decimal(38,2) DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `specification` varchar(255) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  `cpr_id` bigint NOT NULL,
  `attachments_json` text,
  PRIMARY KEY (`id`),
  KEY `FK6tb8rntv9hvj4y805hb3v0l1f` (`cpr_id`),
  CONSTRAINT `FK6tb8rntv9hvj4y805hb3v0l1f` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_records`
--

DROP TABLE IF EXISTS `cpr_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_records` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `address` varchar(255) DEFAULT NULL,
  `business_name` varchar(255) DEFAULT NULL,
  `business_type` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `converted_by` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `cpr_number` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `internal_notes` text,
  `name` varchar(255) DEFAULT NULL,
  `owner` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `pincode` varchar(255) DEFAULT NULL,
  `remarks` text,
  `secondary_email` varchar(255) DEFAULT NULL,
  `secondary_name` varchar(255) DEFAULT NULL,
  `secondary_phone` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` enum('COMPLETED','IN_PROGRESS','PENDING','REJECTED') NOT NULL,
  `tax_id` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `value` decimal(18,2) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `lead_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK3iorvrmd2gyngepjyvf34fs3d` (`lead_id`),
  UNIQUE KEY `UKos2boefjknlsgx17gam9g16th` (`cpr_number`),
  CONSTRAINT `FKn3j8tm0tfwqapylhhdmdpbfb3` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_technical_verification_documents`
--

DROP TABLE IF EXISTS `cpr_technical_verification_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_technical_verification_documents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `cost_workout_cw_no` varchar(255) DEFAULT NULL,
  `cost_workout_id` bigint DEFAULT NULL,
  `document_category` varchar(20) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `sent_at` datetime(6) DEFAULT NULL,
  `sent_by` varchar(255) DEFAULT NULL,
  `sent_to_cost_workout` bit(1) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `uploaded_by` varchar(255) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `visibility` enum('BOTH','CUSTOMER','TEAM_ONLY') NOT NULL,
  `technical_verification_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKt1tn34bek882ers1kbu9t56uu` (`technical_verification_id`),
  CONSTRAINT `FKt1tn34bek882ers1kbu9t56uu` FOREIGN KEY (`technical_verification_id`) REFERENCES `cpr_technical_verifications` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_technical_verifications`
--

DROP TABLE IF EXISTS `cpr_technical_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_technical_verifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `approved_by` varchar(255) DEFAULT NULL,
  `cost_workout_cw_no` varchar(255) DEFAULT NULL,
  `cost_workout_id` bigint DEFAULT NULL,
  `cpr_item_id` bigint DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `customer_remarks` text,
  `division` varchar(255) DEFAULT NULL,
  `drawing_number` varchar(255) DEFAULT NULL,
  `file_exists` bit(1) DEFAULT NULL,
  `file_status` varchar(255) DEFAULT NULL,
  `forwarded_at` datetime(6) DEFAULT NULL,
  `forwarded_by` varchar(255) DEFAULT NULL,
  `forwarded_to_cost_workout` bit(1) NOT NULL,
  `internal_remarks` text,
  `item_description` varchar(255) DEFAULT NULL,
  `item_no` varchar(255) DEFAULT NULL,
  `next_review_date` date DEFAULT NULL,
  `rejected_by` varchar(255) DEFAULT NULL,
  `status` enum('APPROVED','DRAFT','FORWARDED_TO_COST_WORKOUT','PENDING_FILE','REJECTED','UNDER_VERIFICATION','VERIFICATION_COMPLETED') NOT NULL,
  `technical_remarks` text,
  `tv_no` varchar(40) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `verification_date` date DEFAULT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `cpr_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKr92pngj9s3b5eypkqliw766sq` (`tv_no`),
  KEY `FKagvplfqg989xw78agfwn32rdk` (`cpr_id`),
  CONSTRAINT `FKagvplfqg989xw78agfwn32rdk` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cpr_timeline`
--

DROP TABLE IF EXISTS `cpr_timeline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cpr_timeline` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `detail` text,
  `title` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `cpr_id` bigint NOT NULL,
  `device_info` varchar(500) DEFAULT NULL,
  `field` varchar(255) DEFAULT NULL,
  `ip_address` varchar(255) DEFAULT NULL,
  `new_value` text,
  `old_value` text,
  `user_id` bigint DEFAULT NULL,
  `user_name` varchar(255) DEFAULT NULL,
  `user_role` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKi28kuaehtond1pn3rka4ehr4v` (`cpr_id`),
  CONSTRAINT `FKi28kuaehtond1pn3rka4ehr4v` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=101 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cprs`
--

DROP TABLE IF EXISTS `cprs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cprs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `approval_date` datetime(6) DEFAULT NULL,
  `approval_remarks` text,
  `approval_status` enum('APPROVED','PENDING','REJECTED') NOT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `billing_address` text,
  `client_name` varchar(255) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `converted_to_qtn` varchar(255) DEFAULT NULL,
  `cost_workout` decimal(18,2) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `current_stage` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `description` text,
  `email` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gst` varchar(255) DEFAULT NULL,
  `lead_id` bigint DEFAULT NULL,
  `lead_no` varchar(255) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `pr_date` datetime(6) DEFAULT NULL,
  `pr_no` varchar(40) NOT NULL,
  `priority` varchar(255) DEFAULT NULL,
  `profit_percent` decimal(10,2) DEFAULT NULL,
  `project` varchar(255) DEFAULT NULL,
  `rejected_by` varchar(255) DEFAULT NULL,
  `remarks` text,
  `requested_by` varchar(255) DEFAULT NULL,
  `required_date` datetime(6) DEFAULT NULL,
  `shipping_address` text,
  `source_lead` varchar(255) DEFAULT NULL,
  `status` enum('APPROVED','ARCHIVED','CONVERTED','COST_WORKOUT','DELETED','DRAFT','PENDING_APPROVAL','REJECTED') NOT NULL,
  `submitted_at` datetime(6) DEFAULT NULL,
  `submitted_by` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `vendor` varchar(255) DEFAULT NULL,
  `cost_workout_cw_no` varchar(255) DEFAULT NULL,
  `cost_workout_id` bigint DEFAULT NULL,
  `cost_workout_status` varchar(255) DEFAULT NULL,
  `quotation_id` bigint DEFAULT NULL,
  `extended_deadline` date DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `quotation_deadline` date DEFAULT NULL,
  `reference_pr_no` varchar(255) DEFAULT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKcvaf9ng15u0m1vhup3b68tn5` (`pr_no`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `credit_note_items`
--

DROP TABLE IF EXISTS `credit_note_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `credit_note_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `gst_rate` decimal(8,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `credit_note_id` bigint NOT NULL,
  `delivery` varchar(255) DEFAULT NULL,
  `drawing_no` varchar(255) DEFAULT NULL,
  `material` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKiw6h56sqsf6m773dntsef271t` (`credit_note_id`),
  CONSTRAINT `FKiw6h56sqsf6m773dntsef271t` FOREIGN KEY (`credit_note_id`) REFERENCES `credit_notes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `credit_notes`
--

DROP TABLE IF EXISTS `credit_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `credit_notes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `archived_at` datetime(6) DEFAULT NULL,
  `cgst_total` decimal(18,2) DEFAULT NULL,
  `charges` decimal(18,2) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `cn_date` datetime(6) DEFAULT NULL,
  `cn_no` varchar(40) NOT NULL,
  `company_address` text,
  `company_gstin` varchar(255) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `company_pan` varchar(255) DEFAULT NULL,
  `company_state` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `discount` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `inventory_impact` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `reason_detail` text,
  `refund_amount` decimal(18,2) DEFAULT NULL,
  `return_qty` decimal(18,3) DEFAULT NULL,
  `sgst_total` decimal(18,2) DEFAULT NULL,
  `source` varchar(255) DEFAULT NULL,
  `source_ref` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `sub_total` decimal(18,2) DEFAULT NULL,
  `tax_total` decimal(18,2) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `converted_to_pr` varchar(255) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `hsn_view` varchar(255) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `remarks` text,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `settlement_method` varchar(255) DEFAULT NULL,
  `source_date` datetime(6) DEFAULT NULL,
  `tax_type` varchar(255) DEFAULT NULL,
  `terms` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKlmlxdje6lgu3dt47giopnfju9` (`cn_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_attachments`
--

DROP TABLE IF EXISTS `customer_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `customer_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKmj4rv0ncvkevwn0wlkmjm9cgh` (`customer_id`),
  CONSTRAINT `FKmj4rv0ncvkevwn0wlkmjm9cgh` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_contacts`
--

DROP TABLE IF EXISTS `customer_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_contacts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `designation` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `customer_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK729j9cwisdda2ecw8hq5b9vy4` (`customer_id`),
  CONSTRAINT `FK729j9cwisdda2ecw8hq5b9vy4` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_shipping_addresses`
--

DROP TABLE IF EXISTS `customer_shipping_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_shipping_addresses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `city` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `postal` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `street` varchar(255) DEFAULT NULL,
  `customer_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK9x7ekquvm644ej4lq5exatxcn` (`customer_id`),
  CONSTRAINT `FK9x7ekquvm644ej4lq5exatxcn` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `alias` varchar(255) DEFAULT NULL,
  `billing_address` varchar(255) DEFAULT NULL,
  `billing_city` varchar(255) DEFAULT NULL,
  `billing_pin` varchar(255) DEFAULT NULL,
  `billing_state` varchar(255) DEFAULT NULL,
  `business_name` varchar(255) NOT NULL,
  `category` varchar(255) DEFAULT NULL,
  `client_code` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `credit_limit` decimal(18,2) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `notes` text,
  `pan` varchar(255) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `sales_person` varchar(255) DEFAULT NULL,
  `shipping_address` varchar(255) DEFAULT NULL,
  `shipping_city` varchar(255) DEFAULT NULL,
  `shipping_pin` varchar(255) DEFAULT NULL,
  `shipping_state` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `account_holder_name` varchar(255) DEFAULT NULL,
  `account_number` varchar(255) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `client_type` varchar(255) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `geocoded_at` datetime(6) DEFAULT NULL,
  `ifsc` varchar(255) DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `latitude` decimal(38,2) DEFAULT NULL,
  `location_address` varchar(255) DEFAULT NULL,
  `longitude` decimal(38,2) DEFAULT NULL,
  `map_no` varchar(255) DEFAULT NULL,
  `opening_balance` decimal(18,2) DEFAULT NULL,
  `tax_treatment` varchar(255) DEFAULT NULL,
  `upi_id` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cw_master_data`
--

DROP TABLE IF EXISTS `cw_master_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cw_master_data` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `data_key` varchar(60) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `value` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKg8ehsgdpldt0yl2f1b9hw8r3d` (`data_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `delivery_challan_items`
--

DROP TABLE IF EXISTS `delivery_challan_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_challan_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `gst_rate` decimal(8,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `delivery_challan_id` bigint NOT NULL,
  `delivery` varchar(255) DEFAULT NULL,
  `drawing_no` varchar(255) DEFAULT NULL,
  `material` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKjghm4c9xbb5983cirjwll3ndp` (`delivery_challan_id`),
  CONSTRAINT `FKjghm4c9xbb5983cirjwll3ndp` FOREIGN KEY (`delivery_challan_id`) REFERENCES `delivery_challans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `delivery_challans`
--

DROP TABLE IF EXISTS `delivery_challans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_challans` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `archived_at` datetime(6) DEFAULT NULL,
  `billing_address` text,
  `cgst_total` decimal(18,2) DEFAULT NULL,
  `charges` decimal(18,2) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `dc_date` datetime(6) DEFAULT NULL,
  `dc_no` varchar(40) NOT NULL,
  `delivery_date` datetime(6) DEFAULT NULL,
  `discount` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `dispatch_date` datetime(6) DEFAULT NULL,
  `driver_name` varchar(255) DEFAULT NULL,
  `driver_phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `eway_bill` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `lr_number` varchar(255) DEFAULT NULL,
  `notes` text,
  `phone` varchar(255) DEFAULT NULL,
  `sc_ref` varchar(255) DEFAULT NULL,
  `sgst_total` decimal(18,2) DEFAULT NULL,
  `shipping_address` text,
  `so_ref` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `sub_total` decimal(18,2) DEFAULT NULL,
  `tax_total` decimal(18,2) DEFAULT NULL,
  `terms` text,
  `transport_company` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `vehicle_number` varchar(255) DEFAULT NULL,
  `converted_to_invoice` varchar(255) DEFAULT NULL,
  `converted_to_cn` varchar(255) DEFAULT NULL,
  `converted_to_pr` varchar(255) DEFAULT NULL,
  `hsn_view` varchar(255) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `tax_type` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKk8md1s9qbkpbirmutusjtmcn` (`dc_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dispatches`
--

DROP TABLE IF EXISTS `dispatches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dispatches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `customer` varchar(255) DEFAULT NULL,
  `dispatch_date` date DEFAULT NULL,
  `dispatch_number` varchar(30) NOT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `lr_tracking_number` varchar(100) DEFAULT NULL,
  `package_count` int DEFAULT NULL,
  `packing_list_id` varchar(30) DEFAULT NULL,
  `packing_status` varchar(50) DEFAULT NULL,
  `product` varchar(255) DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `remarks` text,
  `sales_order_number` varchar(30) DEFAULT NULL,
  `status` enum('DELIVERED','DISPATCHED','DRAFT','IN_TRANSIT','READY') DEFAULT NULL,
  `transporter` varchar(255) DEFAULT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  `vehicle_number` varchar(50) DEFAULT NULL,
  `work_order_id` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKoymsu94q61f6iqhh9cyvf0512` (`dispatch_number`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_repository`
--

DROP TABLE IF EXISTS `document_repository`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_repository` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `customer_id` bigint DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `document_name` varchar(255) NOT NULL,
  `document_type` varchar(100) NOT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `file_size` bigint NOT NULL,
  `file_type` varchar(100) DEFAULT NULL,
  `metadata` text,
  `module` varchar(100) NOT NULL,
  `record_number` varchar(100) DEFAULT NULL,
  `related_record_id` bigint DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `uploaded_by` varchar(255) DEFAULT NULL,
  `uploaded_by_id` bigint DEFAULT NULL,
  `version_number` int NOT NULL,
  `visibility` enum('BOTH','CUSTOMER','TEAM_ONLY') NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_doc_module_entity` (`module`,`related_record_id`),
  KEY `idx_doc_status` (`status`),
  KEY `idx_doc_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_versions`
--

DROP TABLE IF EXISTS `document_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_versions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `change_notes` text,
  `document_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `file_size` bigint NOT NULL,
  `file_type` varchar(100) DEFAULT NULL,
  `stored_name` varchar(255) DEFAULT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `uploaded_by` varchar(255) DEFAULT NULL,
  `version_number` int NOT NULL,
  `document_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK56xsdce2oxgl4b0m4t6fy3p7w` (`document_id`),
  CONSTRAINT `FK56xsdce2oxgl4b0m4t6fy3p7w` FOREIGN KEY (`document_id`) REFERENCES `document_repository` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `drawing_history`
--

DROP TABLE IF EXISTS `drawing_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `drawing_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `from_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `performed_at` datetime(6) NOT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `remarks` text,
  `to_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `drawing_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKlnmbh1vra87x8pgfh12up8dv7` (`drawing_id`),
  CONSTRAINT `FKlnmbh1vra87x8pgfh12up8dv7` FOREIGN KEY (`drawing_id`) REFERENCES `drawings` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `drawing_revisions`
--

DROP TABLE IF EXISTS `drawing_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `drawing_revisions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `approved_at` datetime(6) DEFAULT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `change_description` text,
  `created_by` varchar(255) DEFAULT NULL,
  `description` text,
  `file_checksum` varchar(100) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `file_size` bigint DEFAULT NULL,
  `file_type` varchar(20) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `released_at` datetime(6) DEFAULT NULL,
  `released_by` varchar(255) DEFAULT NULL,
  `revision` varchar(50) NOT NULL,
  `revision_number` int DEFAULT NULL,
  `status` enum('APPROVED','DRAFT','OBSOLETE','PENDING_REVIEW','REJECTED','RELEASED') DEFAULT NULL,
  `drawing_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK7ot39qst07lu4m9qqrnbvvrx1` (`drawing_id`,`revision`),
  CONSTRAINT `FKmqbtabvyr6ha8wu3gdn6wdkeg` FOREIGN KEY (`drawing_id`) REFERENCES `drawings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `drawings`
--

DROP TABLE IF EXISTS `drawings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `drawings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `drawing_number` varchar(50) NOT NULL,
  `drawing_revision` varchar(50) DEFAULT NULL,
  `file_checksum` varchar(100) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `file_size` bigint DEFAULT NULL,
  `file_type` varchar(20) DEFAULT NULL,
  `item_name` varchar(255) DEFAULT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  `uploaded_by` varchar(255) DEFAULT NULL,
  `uploaded_date` datetime(6) DEFAULT NULL,
  `verification_datetime` datetime(6) DEFAULT NULL,
  `verification_remarks` text,
  `verification_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `work_order_id` varchar(20) NOT NULL,
  `work_order_item_id` varchar(100) DEFAULT NULL,
  `current_revision_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKd3b3ohruyl9i1kr3p44c3518v` (`drawing_number`),
  KEY `FKi30aw24kmwp7vda6l8v9a3eui` (`current_revision_id`),
  CONSTRAINT `FKi30aw24kmwp7vda6l8v9a3eui` FOREIGN KEY (`current_revision_id`) REFERENCES `drawing_revisions` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `edit_history`
--

DROP TABLE IF EXISTS `edit_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `edit_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `change_summary` text,
  `changed_by` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `field` varchar(255) DEFAULT NULL,
  `module_type` varchar(40) NOT NULL,
  `new_value` text,
  `old_value` text,
  `record_id` bigint NOT NULL,
  `version` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_edit_history_record` (`module_type`,`record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `exchange_rates`
--

DROP TABLE IF EXISTS `exchange_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_rates` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `base_currency` varchar(10) NOT NULL,
  `currency_code` varchar(10) NOT NULL,
  `fetched_at` datetime(6) NOT NULL,
  `rate` decimal(24,10) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKaof4u3g8d402kpcrryj740fkq` (`base_currency`,`currency_code`)
) ENGINE=InnoDB AUTO_INCREMENT=1827 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `follow_up_attachments`
--

DROP TABLE IF EXISTS `follow_up_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `follow_up_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `uploaded_by` varchar(255) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `follow_up_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKnniwdvmab8vv68i1guq8cwdam` (`follow_up_id`),
  CONSTRAINT `FKnniwdvmab8vv68i1guq8cwdam` FOREIGN KEY (`follow_up_id`) REFERENCES `lead_follow_ups` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `followup_attachments`
--

DROP TABLE IF EXISTS `followup_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `followup_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `followup_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKob4cjfeouq6fa3plcvvjsquas` (`followup_id`),
  CONSTRAINT `FKob4cjfeouq6fa3plcvvjsquas` FOREIGN KEY (`followup_id`) REFERENCES `followups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `followups`
--

DROP TABLE IF EXISTS `followups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `followups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `address` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `assign_to` varchar(255) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `current_status` varchar(255) DEFAULT NULL,
  `customer_feedback` text,
  `discussion_summary` text,
  `email` varchar(255) DEFAULT NULL,
  `executive` varchar(255) DEFAULT NULL,
  `followup_date` date NOT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `lead_id` bigint DEFAULT NULL,
  `lead_name` varchar(255) DEFAULT NULL,
  `lead_stage` varchar(255) DEFAULT NULL,
  `mode` varchar(255) DEFAULT NULL,
  `next_followup_date` date DEFAULT NULL,
  `outcome` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `priority` varchar(255) DEFAULT NULL,
  `reminder` varchar(255) DEFAULT NULL,
  `reminder_type` varchar(255) DEFAULT NULL,
  `requirement` text,
  `source` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `time` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `industries`
--

DROP TABLE IF EXISTS `industries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `industries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKbod7w9cn5j9afqkwfldjy4yiy` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoice_items`
--

DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `gst_rate` decimal(8,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `invoice_id` bigint NOT NULL,
  `country_of_origin` varchar(255) DEFAULT NULL,
  `delivery` varchar(255) DEFAULT NULL,
  `drawing_no` varchar(255) DEFAULT NULL,
  `manufacturer` varchar(255) DEFAULT NULL,
  `material` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK46ae0lhu1oqs7cv91fn6y9n7w` (`invoice_id`),
  CONSTRAINT `FK46ae0lhu1oqs7cv91fn6y9n7w` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `archived_at` datetime(6) DEFAULT NULL,
  `bank_account` varchar(255) DEFAULT NULL,
  `bank_branch` varchar(255) DEFAULT NULL,
  `bank_ifsc` varchar(255) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `bank_type` varchar(255) DEFAULT NULL,
  `bank_upi` varchar(255) DEFAULT NULL,
  `billing_address` text,
  `cgst_total` decimal(18,2) DEFAULT NULL,
  `charges` decimal(18,2) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `company_address` text,
  `company_gstin` varchar(255) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `company_pan` varchar(255) DEFAULT NULL,
  `company_state` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `converted_to_credit_note` varchar(255) DEFAULT NULL,
  `converted_to_receipt` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `discount` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `due_date` datetime(6) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `invoice_date` datetime(6) DEFAULT NULL,
  `invoice_no` varchar(40) NOT NULL,
  `notes` text,
  `pan` varchar(255) DEFAULT NULL,
  `payment_status` varchar(40) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `reference_no` varchar(255) DEFAULT NULL,
  `round_off` decimal(8,2) DEFAULT NULL,
  `sgst_total` decimal(18,2) DEFAULT NULL,
  `ship_same_as_bill` bit(1) NOT NULL,
  `shipping_address` text,
  `source` varchar(255) DEFAULT NULL,
  `source_ref` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `sub_total` decimal(18,2) DEFAULT NULL,
  `tax_total` decimal(18,2) DEFAULT NULL,
  `terms` text,
  `updated_at` datetime(6) DEFAULT NULL,
  `appendix_date` datetime(6) DEFAULT NULL,
  `appendix_no` varchar(255) DEFAULT NULL,
  `authorization_date` datetime(6) DEFAULT NULL,
  `authorized_signatory` varchar(255) DEFAULT NULL,
  `bank_address` text,
  `bank_swift` varchar(255) DEFAULT NULL,
  `buyer_country` varchar(255) DEFAULT NULL,
  `commodity` varchar(255) DEFAULT NULL,
  `company_email` varchar(255) DEFAULT NULL,
  `company_phone` varchar(255) DEFAULT NULL,
  `consignee_address` text,
  `consignee_country` varchar(255) DEFAULT NULL,
  `consignee_name` varchar(255) DEFAULT NULL,
  `consignee_same_as_buyer` bit(1) NOT NULL,
  `contract_date` datetime(6) DEFAULT NULL,
  `contract_no` varchar(255) DEFAULT NULL,
  `country_of_final_destination` varchar(255) DEFAULT NULL,
  `country_of_origin` varchar(255) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `designation` varchar(255) DEFAULT NULL,
  `exporter_ref` varchar(255) DEFAULT NULL,
  `hs_code` varchar(255) DEFAULT NULL,
  `hsn_view` varchar(255) DEFAULT NULL,
  `invoice_type` varchar(255) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `lut_arn` varchar(255) DEFAULT NULL,
  `packing_details` text,
  `payment_terms` varchar(255) DEFAULT NULL,
  `place` varchar(255) DEFAULT NULL,
  `place_of_receipt` varchar(255) DEFAULT NULL,
  `po_date` datetime(6) DEFAULT NULL,
  `po_no` varchar(255) DEFAULT NULL,
  `port_of_delivery` varchar(255) DEFAULT NULL,
  `port_of_discharge` varchar(255) DEFAULT NULL,
  `port_of_loading` varchar(255) DEFAULT NULL,
  `pre_carriage_by` varchar(255) DEFAULT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `tax_treatment` varchar(255) DEFAULT NULL,
  `tax_type` varchar(255) DEFAULT NULL,
  `terms_of_delivery` varchar(255) DEFAULT NULL,
  `vessel_flight_no` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK465kfg5i8gam6kc8fnb96fqce` (`invoice_no`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lead_activities`
--

DROP TABLE IF EXISTS `lead_activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_activities` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `detail` text,
  `owner` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `lead_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKle7c8q5nrqmbyt6ewdijgoqqw` (`lead_id`),
  CONSTRAINT `FKle7c8q5nrqmbyt6ewdijgoqqw` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=125 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lead_attachments`
--

DROP TABLE IF EXISTS `lead_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `lead_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKqg8jq4wj5x5fhy99vtdiwnys9` (`lead_id`),
  CONSTRAINT `FKqg8jq4wj5x5fhy99vtdiwnys9` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lead_follow_ups`
--

DROP TABLE IF EXISTS `lead_follow_ups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_follow_ups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `assigned_user` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `follow_up_date` date NOT NULL,
  `follow_up_time` varchar(255) DEFAULT NULL,
  `mode` enum('CALL','EMAIL','MEETING','OTHER','VISIT','WHATSAPP') DEFAULT NULL,
  `priority` enum('HIGH','LOW','MEDIUM') DEFAULT NULL,
  `remarks` text,
  `status` enum('ARCHIVED','CANCELLED','COMPLETED','DRAFT','PENDING') NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `lead_id` bigint NOT NULL,
  `discussion` text,
  `feedback` text,
  `next_follow_up_date` date DEFAULT NULL,
  `outcome` text,
  `reminder` text,
  `reminder_type` varchar(40) DEFAULT NULL,
  `requirement` text,
  `follow_up_no` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKlblwvr3vmv09ar9r1s4t4p9yi` (`follow_up_no`),
  KEY `FKa4834s99f7mhq9u32e66fmnfb` (`lead_id`),
  CONSTRAINT `FKa4834s99f7mhq9u32e66fmnfb` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lead_history`
--

DROP TABLE IF EXISTS `lead_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `changed_by` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `field` varchar(255) DEFAULT NULL,
  `new_value` text,
  `old_value` text,
  `lead_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK5ujkq30qgnxikbcwuvr972yvc` (`lead_id`),
  CONSTRAINT `FK5ujkq30qgnxikbcwuvr972yvc` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=375 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lead_notes`
--

DROP TABLE IF EXISTS `lead_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_notes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `author` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `text` text NOT NULL,
  `lead_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKpgleeh9alpqu33f2ac651l1ae` (`lead_id`),
  CONSTRAINT `FKpgleeh9alpqu33f2ac651l1ae` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lead_timeline`
--

DROP TABLE IF EXISTS `lead_timeline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead_timeline` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `detail` text,
  `title` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `lead_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKc3aqt458k737tsp84eh15t6oh` (`lead_id`),
  CONSTRAINT `FKc3aqt458k737tsp84eh15t6oh` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=560 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `leads`
--

DROP TABLE IF EXISTS `leads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leads` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `address` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `business_name` varchar(255) DEFAULT NULL,
  `business_type` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `internal_notes` text,
  `name` varchar(190) NOT NULL,
  `owner` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `pincode` varchar(255) DEFAULT NULL,
  `secondary_email` varchar(255) DEFAULT NULL,
  `secondary_name` varchar(255) DEFAULT NULL,
  `secondary_phone` varchar(255) DEFAULT NULL,
  `source` varchar(255) DEFAULT NULL,
  `stage` enum('COLD','CONTACTED','HOT','LOST','NEGOTIATION','NEW','PROPOSAL','PROPOSAL_SENT','QUALIFIED','WARM','WON') NOT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` enum('ACTIVE','ARCHIVED','DELETED','INACTIVE') NOT NULL,
  `tax_id` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `value` decimal(18,2) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `deleted_at` datetime(6) DEFAULT NULL,
  `lead_no` varchar(40) DEFAULT NULL,
  `priority` varchar(255) DEFAULT NULL,
  `expected_close_date` date DEFAULT NULL,
  `landmark` varchar(255) DEFAULT NULL,
  `secondary_designation` varchar(255) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `preferred_vendor` varchar(255) DEFAULT NULL,
  `project` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_leads_lead_no` (`lead_no`)
) ENGINE=InnoDB AUTO_INCREMENT=103 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_expense_attachments`
--

DROP TABLE IF EXISTS `marketing_expense_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_expense_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `expense_id` bigint NOT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `trip_id` bigint NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_expense_audit_logs`
--

DROP TABLE IF EXISTS `marketing_expense_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_expense_audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` varchar(40) NOT NULL,
  `description` text,
  `expense_id` bigint DEFAULT NULL,
  `performed_at` datetime(6) DEFAULT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `performed_by_user_id` bigint DEFAULT NULL,
  `trip_id` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_expense_trips`
--

DROP TABLE IF EXISTS `marketing_expense_trips`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_expense_trips` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `approval_status` varchar(30) NOT NULL,
  `approved_at` datetime(6) DEFAULT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `correction_comments` text,
  `created_at` datetime(6) DEFAULT NULL,
  `deleted` bit(1) NOT NULL,
  `destination` varchar(255) DEFAULT NULL,
  `expected_end_date` date DEFAULT NULL,
  `expected_end_time` varchar(255) DEFAULT NULL,
  `expense_count` int DEFAULT NULL,
  `food_total` decimal(12,2) DEFAULT NULL,
  `local_travel_total` decimal(12,2) DEFAULT NULL,
  `marketer` varchar(255) NOT NULL,
  `marketer_user_id` bigint NOT NULL,
  `other_total` decimal(12,2) DEFAULT NULL,
  `purpose` varchar(255) DEFAULT NULL,
  `rejection_reason` text,
  `remarks` text,
  `start_date` date DEFAULT NULL,
  `start_latitude` decimal(38,2) DEFAULT NULL,
  `start_location` varchar(255) DEFAULT NULL,
  `start_location_accuracy` decimal(38,2) DEFAULT NULL,
  `start_longitude` decimal(38,2) DEFAULT NULL,
  `start_time` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL,
  `stay_total` decimal(12,2) DEFAULT NULL,
  `total_amount` decimal(12,2) DEFAULT NULL,
  `travel_plan_ref` varchar(255) DEFAULT NULL,
  `travel_total` decimal(12,2) DEFAULT NULL,
  `trip_off_date_time` datetime(6) DEFAULT NULL,
  `trip_off_latitude` decimal(38,2) DEFAULT NULL,
  `trip_off_location` varchar(255) DEFAULT NULL,
  `trip_off_longitude` decimal(38,2) DEFAULT NULL,
  `trip_on_date_time` datetime(6) DEFAULT NULL,
  `trip_on_latitude` decimal(38,2) DEFAULT NULL,
  `trip_on_location` varchar(255) DEFAULT NULL,
  `trip_on_longitude` decimal(38,2) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_id` bigint DEFAULT NULL,
  `visit_ref` varchar(255) DEFAULT NULL,
  `with_bill_total` decimal(12,2) DEFAULT NULL,
  `without_bill_total` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_expenses`
--

DROP TABLE IF EXISTS `marketing_expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_expenses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `amount` decimal(12,2) DEFAULT NULL,
  `bill_status` varchar(20) NOT NULL,
  `check_in_date` date DEFAULT NULL,
  `check_in_time` varchar(255) DEFAULT NULL,
  `check_out_date` date DEFAULT NULL,
  `check_out_time` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_by_user_id` bigint DEFAULT NULL,
  `description` text,
  `expense_date` date DEFAULT NULL,
  `expense_sub_type` varchar(50) DEFAULT NULL,
  `expense_time` varchar(255) DEFAULT NULL,
  `expense_type` varchar(40) NOT NULL,
  `hotel_name` varchar(255) DEFAULT NULL,
  `local_from` varchar(255) DEFAULT NULL,
  `local_to` varchar(255) DEFAULT NULL,
  `local_travel_mode` varchar(255) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `meal_type` varchar(255) DEFAULT NULL,
  `number_of_nights` int DEFAULT NULL,
  `number_of_persons` int DEFAULT NULL,
  `operator_provider` varchar(255) DEFAULT NULL,
  `passenger_name` varchar(255) DEFAULT NULL,
  `payment_method` varchar(255) DEFAULT NULL,
  `remarks` text,
  `restaurant_vendor` varchar(255) DEFAULT NULL,
  `ticket_number` varchar(255) DEFAULT NULL,
  `travel_from` varchar(255) DEFAULT NULL,
  `travel_mode` varchar(255) DEFAULT NULL,
  `travel_purpose` varchar(255) DEFAULT NULL,
  `travel_to` varchar(255) DEFAULT NULL,
  `trip_id` bigint NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `without_bill_reason` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_followups`
--

DROP TABLE IF EXISTS `marketing_followups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_followups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `customer_response` text,
  `followup_date` date NOT NULL,
  `lead_id` bigint DEFAULT NULL,
  `mode` varchar(255) DEFAULT NULL,
  `next_action` text,
  `next_followup_date` date DEFAULT NULL,
  `purpose` text,
  `remarks` text,
  `status` varchar(255) DEFAULT NULL,
  `time` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_leads`
--

DROP TABLE IF EXISTS `marketing_leads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_leads` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `designation` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `estimated_value` decimal(18,2) DEFAULT NULL,
  `lead_date` date DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `marketer` varchar(255) DEFAULT NULL,
  `marketer_user_id` bigint DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `priority` varchar(255) DEFAULT NULL,
  `requirement` text,
  `source` varchar(255) DEFAULT NULL,
  `stage` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_location_tracking`
--

DROP TABLE IF EXISTS `marketing_location_tracking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_location_tracking` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `accuracy` decimal(38,2) DEFAULT NULL,
  `battery_level` int DEFAULT NULL,
  `current_stop_id` bigint DEFAULT NULL,
  `heading` decimal(38,2) DEFAULT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `location_label` varchar(255) DEFAULT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `marketer_name` varchar(255) DEFAULT NULL,
  `received_at` datetime(6) NOT NULL,
  `recorded_at` datetime(6) NOT NULL,
  `speed` decimal(38,2) DEFAULT NULL,
  `travel_plan_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_location_tracking_plan` (`travel_plan_id`),
  KEY `idx_tracking_user_time` (`user_id`,`recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_locations`
--

DROP TABLE IF EXISTS `marketing_locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_locations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `address` varchar(255) NOT NULL,
  `city` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `customer_id` bigint DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `geocoded_at` datetime(6) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `location_name` varchar(255) NOT NULL,
  `location_type` varchar(255) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `marketing_visit_reference` varchar(255) DEFAULT NULL,
  `osm_id` varchar(255) DEFAULT NULL,
  `osm_type` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `pin` varchar(255) DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_plan_change_history`
--

DROP TABLE IF EXISTS `marketing_plan_change_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_plan_change_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` varchar(40) NOT NULL,
  `description` text,
  `performed_at` datetime(6) DEFAULT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `performed_by_user_id` bigint DEFAULT NULL,
  `stop_id` bigint DEFAULT NULL,
  `travel_plan_id` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_route_snapshots`
--

DROP TABLE IF EXISTS `marketing_route_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_route_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `active_stop_sequence` text,
  `calculated_at` datetime(6) DEFAULT NULL,
  `calculated_by` varchar(255) DEFAULT NULL,
  `distance_difference_km` decimal(10,2) DEFAULT NULL,
  `previous_total_distance_km` decimal(10,2) DEFAULT NULL,
  `previous_total_travel_time_minutes` int DEFAULT NULL,
  `route_api_response` longtext,
  `total_distance_km` decimal(10,2) DEFAULT NULL,
  `total_travel_time_minutes` int DEFAULT NULL,
  `travel_plan_id` bigint NOT NULL,
  `trigger_type` varchar(30) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_travel_plan_stops`
--

DROP TABLE IF EXISTS `marketing_travel_plan_stops`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_travel_plan_stops` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actual_check_in` datetime(6) DEFAULT NULL,
  `actual_check_out` datetime(6) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `appointment_status` varchar(255) DEFAULT NULL,
  `cancellation_reason` varchar(255) DEFAULT NULL,
  `cancelled_at` datetime(6) DEFAULT NULL,
  `cancelled_by` varchar(255) DEFAULT NULL,
  `check_in_notes` varchar(255) DEFAULT NULL,
  `check_out_notes` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `contact_designation` varchar(255) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `distance_from_previous_km` decimal(10,2) DEFAULT NULL,
  `district` varchar(255) DEFAULT NULL,
  `expected_stay_duration_minutes` int DEFAULT NULL,
  `google_place_id` varchar(255) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `planned_arrival_time` varchar(255) DEFAULT NULL,
  `planned_date` date DEFAULT NULL,
  `planned_departure_time` varchar(255) DEFAULT NULL,
  `priority` varchar(255) DEFAULT NULL,
  `purpose_of_visit` varchar(255) DEFAULT NULL,
  `remarks` text,
  `reschedule_notes` varchar(255) DEFAULT NULL,
  `rescheduled_date` date DEFAULT NULL,
  `rescheduled_time` varchar(255) DEFAULT NULL,
  `sequence` int NOT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL,
  `travel_plan_id` bigint NOT NULL,
  `travel_time_from_previous_minutes` int DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_travel_plans`
--

DROP TABLE IF EXISTS `marketing_travel_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_travel_plans` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `active_stops_count` int DEFAULT NULL,
  `approval_status` varchar(255) DEFAULT NULL,
  `approved_at` datetime(6) DEFAULT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `deleted` bit(1) NOT NULL,
  `end_date` date DEFAULT NULL,
  `end_latitude` decimal(38,2) DEFAULT NULL,
  `end_longitude` decimal(38,2) DEFAULT NULL,
  `end_time` varchar(255) DEFAULT NULL,
  `ending_location` varchar(255) DEFAULT NULL,
  `marketer` varchar(255) NOT NULL,
  `marketer_user_id` bigint NOT NULL,
  `purpose` varchar(255) DEFAULT NULL,
  `rejection_reason` text,
  `remarks` text,
  `revision_comments` text,
  `route_color` varchar(20) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `start_latitude` decimal(38,2) DEFAULT NULL,
  `start_longitude` decimal(38,2) DEFAULT NULL,
  `start_time` varchar(255) DEFAULT NULL,
  `starting_location` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `total_distance_km` decimal(10,2) DEFAULT NULL,
  `total_travel_time_minutes` int DEFAULT NULL,
  `trip_actual_end` datetime(6) DEFAULT NULL,
  `trip_actual_start` datetime(6) DEFAULT NULL,
  `trip_end_latitude` decimal(38,2) DEFAULT NULL,
  `trip_end_longitude` decimal(38,2) DEFAULT NULL,
  `trip_start_latitude` decimal(38,2) DEFAULT NULL,
  `trip_start_longitude` decimal(38,2) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_visit_activities`
--

DROP TABLE IF EXISTS `marketing_visit_activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_visit_activities` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activity_date` date DEFAULT NULL,
  `activity_time` varchar(255) DEFAULT NULL,
  `activity_type` varchar(20) NOT NULL,
  `assigned_employee` varchar(255) DEFAULT NULL,
  `attachment_paths` text,
  `company_name` varchar(255) DEFAULT NULL,
  `contact_department` varchar(255) DEFAULT NULL,
  `contact_designation` varchar(255) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_name` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(255) DEFAULT NULL,
  `contact_whats_app` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_by_user_id` bigint DEFAULT NULL,
  `customer_requirement` text,
  `customer_response` text,
  `discussion` text,
  `followup_type` varchar(255) DEFAULT NULL,
  `group_name` varchar(255) DEFAULT NULL,
  `next_action` varchar(255) DEFAULT NULL,
  `next_followup_date` date DEFAULT NULL,
  `next_followup_time` varchar(255) DEFAULT NULL,
  `outcome` varchar(255) DEFAULT NULL,
  `remarks` text,
  `status` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_id` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marketing_visits`
--

DROP TABLE IF EXISTS `marketing_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketing_visits` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `address` text,
  `appointment_date` date DEFAULT NULL,
  `appointment_remarks` text,
  `appointment_status` varchar(255) DEFAULT NULL,
  `appointment_time` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `budget` varchar(255) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `customer_feedback` text,
  `customer_id` bigint DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `customer_response` text,
  `deleted` bit(1) NOT NULL,
  `designation` varchar(255) DEFAULT NULL,
  `discussion` text,
  `email` varchar(255) DEFAULT NULL,
  `entry_date_time` datetime(6) DEFAULT NULL,
  `estimated_value` decimal(18,2) DEFAULT NULL,
  `exit_date_time` datetime(6) DEFAULT NULL,
  `expected_purchase_timeline` varchar(255) DEFAULT NULL,
  `followup_customer_response` text,
  `followup_date` date DEFAULT NULL,
  `followup_mode` varchar(255) DEFAULT NULL,
  `followup_remarks` text,
  `followup_status` varchar(255) DEFAULT NULL,
  `handover_at` datetime(6) DEFAULT NULL,
  `handover_remarks` text,
  `handover_status` varchar(255) DEFAULT NULL,
  `handover_to` varchar(255) DEFAULT NULL,
  `latitude` decimal(38,2) DEFAULT NULL,
  `lead_created_at` datetime(6) DEFAULT NULL,
  `lead_id` bigint DEFAULT NULL,
  `lead_no` varchar(255) DEFAULT NULL,
  `lead_priority` varchar(255) DEFAULT NULL,
  `lead_stage` varchar(255) DEFAULT NULL,
  `lead_status` varchar(255) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `longitude` decimal(38,2) DEFAULT NULL,
  `marketer` varchar(255) DEFAULT NULL,
  `marketer_user_id` bigint DEFAULT NULL,
  `meeting_designation` varchar(255) DEFAULT NULL,
  `meeting_person` varchar(255) DEFAULT NULL,
  `next_action` varchar(255) DEFAULT NULL,
  `no_lead_reason` text,
  `outcome` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `product_service` varchar(255) DEFAULT NULL,
  `q_form_details` text,
  `q_form_remarks` text,
  `q_form_status` varchar(255) DEFAULT NULL,
  `q_form_submitted_at` datetime(6) DEFAULT NULL,
  `quantity` varchar(255) DEFAULT NULL,
  `remarks` text,
  `requirement` text,
  `requirement_priority` varchar(255) DEFAULT NULL,
  `schedule_date` date DEFAULT NULL,
  `technical_discussion` text,
  `technical_remarks` text,
  `technical_requirement` text,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_description` text,
  `visit_no` varchar(255) DEFAULT NULL,
  `visit_status` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `master_values`
--

DROP TABLE IF EXISTS `master_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `master_values` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `master_key` varchar(60) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `value` varchar(120) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKe90ie9v8j6ty5bjmkvhw5apao` (`master_key`,`value`)
) ENGINE=InnoDB AUTO_INCREMENT=336 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `model_history`
--

DROP TABLE IF EXISTS `model_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `from_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `performed_at` datetime(6) NOT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `remarks` text,
  `to_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `model_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK4wkyic4faytx936edxculwl89` (`model_id`),
  CONSTRAINT `FK4wkyic4faytx936edxculwl89` FOREIGN KEY (`model_id`) REFERENCES `models` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `models`
--

DROP TABLE IF EXISTS `models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `models` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `conversion_completed_at` datetime(6) DEFAULT NULL,
  `conversion_error` text,
  `conversion_started_at` datetime(6) DEFAULT NULL,
  `conversion_status` varchar(30) DEFAULT NULL,
  `converted_file_path` varchar(500) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `file_checksum` varchar(100) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `file_size` bigint DEFAULT NULL,
  `file_type` varchar(20) DEFAULT NULL,
  `item_name` varchar(255) DEFAULT NULL,
  `model_number` varchar(50) NOT NULL,
  `model_revision` varchar(50) DEFAULT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  `uploaded_by` varchar(255) DEFAULT NULL,
  `uploaded_date` datetime(6) DEFAULT NULL,
  `verification_datetime` datetime(6) DEFAULT NULL,
  `verification_remarks` text,
  `verification_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `work_order_id` varchar(20) NOT NULL,
  `work_order_item_id` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKfplif4oxquppn5urj5wlbyxvr` (`model_number`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `is_test` bit(1) NOT NULL,
  `max_reminders` int NOT NULL,
  `message` varchar(2000) NOT NULL,
  `module` varchar(40) NOT NULL,
  `next_reminder_at` datetime(6) DEFAULT NULL,
  `notification_type` varchar(40) DEFAULT NULL,
  `priority` enum('HIGH','LOW','NORMAL','URGENT') NOT NULL,
  `read_at` datetime(6) DEFAULT NULL,
  `recipient_user_id` bigint NOT NULL,
  `reference_id` bigint DEFAULT NULL,
  `reference_type` varchar(60) DEFAULT NULL,
  `reminder_count` int NOT NULL,
  `resolved_at` datetime(6) DEFAULT NULL,
  `sender_user_id` bigint DEFAULT NULL,
  `status` enum('READ','RESOLVED','UNREAD') NOT NULL,
  `title` varchar(200) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notif_recipient` (`recipient_user_id`),
  KEY `idx_notif_status` (`status`),
  KEY `idx_notif_reminder` (`next_reminder_at`),
  KEY `idx_notif_recipient_status` (`recipient_user_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=136 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `packing_lists`
--

DROP TABLE IF EXISTS `packing_lists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `packing_lists` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `customer` varchar(255) DEFAULT NULL,
  `packed_quantity` int DEFAULT NULL,
  `packing_date` date DEFAULT NULL,
  `packing_list_number` varchar(30) NOT NULL,
  `product` varchar(255) DEFAULT NULL,
  `production_quantity` int DEFAULT NULL,
  `remarks` text,
  `sales_order_number` varchar(30) DEFAULT NULL,
  `status` enum('COMPLETED','IN_PROGRESS','PENDING','READY_FOR_DISPATCH') DEFAULT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  `work_order_id` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKgl9e6n33xutltwil4f6a8kn7q` (`packing_list_number`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payment_receipts`
--

DROP TABLE IF EXISTS `payment_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_receipts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `amount` decimal(18,2) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `cheque_tx` varchar(255) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `company_address` text,
  `company_gstin` varchar(255) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `company_pan` varchar(255) DEFAULT NULL,
  `company_state` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `invoice_ref` varchar(255) DEFAULT NULL,
  `payment_date` datetime(6) DEFAULT NULL,
  `payment_mode` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `receipt_no` varchar(40) NOT NULL,
  `reference_no` varchar(255) DEFAULT NULL,
  `remarks` text,
  `source` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKc7g683jsgxk908tfcid88tsvd` (`receipt_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `processing_jobs`
--

DROP TABLE IF EXISTS `processing_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `processing_jobs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `job_type` varchar(60) NOT NULL,
  `status` varchar(20) NOT NULL,
  `input_ref` varchar(255) NOT NULL,
  `fingerprint` varchar(64) NOT NULL,
  `requested_by_user_id` bigint DEFAULT NULL,
  `item_count` int NOT NULL,
  `attempts` int NOT NULL,
  `max_attempts` int NOT NULL,
  `input_manifest` text,
  `result_payload` longtext,
  `error_message` varchar(500) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `started_at` datetime(6) DEFAULT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pjob_status_created` (`status`,`created_at`),
  KEY `idx_pjob_type_fingerprint` (`job_type`,`fingerprint`),
  KEY `idx_pjob_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `production_entries`
--

DROP TABLE IF EXISTS `production_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `entry_date` date DEFAULT NULL,
  `input_quantity` int DEFAULT NULL,
  `operator` varchar(255) DEFAULT NULL,
  `output_quantity` int DEFAULT NULL,
  `production_type` varchar(30) DEFAULT NULL,
  `rejected_quantity` int DEFAULT NULL,
  `remarks` text,
  `stage` varchar(100) NOT NULL,
  `status` enum('COMPLETED','HOLD','IN_PROGRESS','PENDING','SKIPPED') DEFAULT NULL,
  `work_order_item_id` varchar(100) DEFAULT NULL,
  `production_order_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKjdikqegy485omj8hr8quaitce` (`production_order_id`,`work_order_item_id`,`stage`),
  CONSTRAINT `FK9gi6r1w0lusniqss61m926qru` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `production_order_items`
--

DROP TABLE IF EXISTS `production_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_order_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `batch_number` varchar(50) DEFAULT NULL,
  `current_stage` varchar(100) DEFAULT NULL,
  `department` varchar(50) DEFAULT NULL,
  `drawing_number` varchar(100) DEFAULT NULL,
  `drawing_revision` varchar(50) DEFAULT NULL,
  `pattern_number` varchar(100) DEFAULT NULL,
  `produced_quantity` int NOT NULL,
  `product_code` varchar(100) DEFAULT NULL,
  `product_name` varchar(255) NOT NULL,
  `production_type` enum('ASSEMBLY','CASTING','FABRICATION') NOT NULL,
  `quantity` int NOT NULL,
  `rejected_quantity` int NOT NULL,
  `status` enum('ADMIN_APPROVED','ADMIN_REJECTED','APPROVED','CANCELLED','COMPLETED','DISPATCHED','DRAFT','FAILED','HOLD','IN_PROGRESS','PACKED','PENDING','PENDING_ADMIN_APPROVAL','PENDING_PRODUCTION_APPROVAL','PENDING_QC','PRODUCTION_APPROVED','PRODUCTION_REJECTED','READY_FOR_DISPATCH') DEFAULT NULL,
  `unit` varchar(20) DEFAULT NULL,
  `production_order_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK6r477d4afsjrqsqx39sxb0r99` (`production_order_id`),
  CONSTRAINT `FK6r477d4afsjrqsqx39sxb0r99` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `production_orders`
--

DROP TABLE IF EXISTS `production_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `admin_approved_at` datetime(6) DEFAULT NULL,
  `admin_approved_by` varchar(255) DEFAULT NULL,
  `batch_number` varchar(50) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `current_stage` varchar(100) DEFAULT NULL,
  `customer` varchar(255) DEFAULT NULL,
  `customer_code` varchar(50) DEFAULT NULL,
  `department` varchar(50) DEFAULT NULL,
  `drawing_number` varchar(100) DEFAULT NULL,
  `drawing_revision` varchar(50) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `pattern_number` varchar(100) DEFAULT NULL,
  `priority` enum('HIGH','LOW','MEDIUM','URGENT') NOT NULL,
  `product` varchar(255) DEFAULT NULL,
  `product_code` varchar(100) DEFAULT NULL,
  `production_approved_at` datetime(6) DEFAULT NULL,
  `production_approved_by` varchar(255) DEFAULT NULL,
  `production_type` enum('ASSEMBLY','CASTING','FABRICATION') DEFAULT NULL,
  `progress` int DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `remarks` text,
  `sales_order_id` varchar(50) DEFAULT NULL,
  `sales_order_number` varchar(50) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `status` enum('ADMIN_APPROVED','ADMIN_REJECTED','APPROVED','CANCELLED','COMPLETED','DISPATCHED','DRAFT','FAILED','HOLD','IN_PROGRESS','PACKED','PENDING','PENDING_ADMIN_APPROVAL','PENDING_PRODUCTION_APPROVAL','PENDING_QC','PRODUCTION_APPROVED','PRODUCTION_REJECTED','READY_FOR_DISPATCH') NOT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  `work_order` varchar(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKdq8iia1uvionqquyx53uy5d3g` (`work_order`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `production_trackers`
--

DROP TABLE IF EXISTS `production_trackers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_trackers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `assembly_end` date DEFAULT NULL,
  `assembly_pct` int DEFAULT NULL,
  `assembly_start` date DEFAULT NULL,
  `casting_end` date DEFAULT NULL,
  `casting_pct` int DEFAULT NULL,
  `casting_start` date DEFAULT NULL,
  `cpo_no` varchar(50) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `current_status` varchar(30) DEFAULT NULL,
  `customer` varchar(200) DEFAULT NULL,
  `dispatch_end` date DEFAULT NULL,
  `dispatch_pct` int DEFAULT NULL,
  `dispatch_start` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `fabrication_end` date DEFAULT NULL,
  `fabrication_pct` int DEFAULT NULL,
  `fabrication_start` date DEFAULT NULL,
  `order_date` date DEFAULT NULL,
  `packing_end` date DEFAULT NULL,
  `packing_pct` int DEFAULT NULL,
  `packing_start` date DEFAULT NULL,
  `qc_end` date DEFAULT NULL,
  `qc_pct` int DEFAULT NULL,
  `qc_start` date DEFAULT NULL,
  `remarks` text,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  `sales_order_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKbx8jmfkcsqv250xv0o0xywnku` (`sales_order_id`),
  CONSTRAINT `FKbx8jmfkcsqv250xv0o0xywnku` FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `description` varchar(255) DEFAULT NULL,
  `gst_rate` decimal(6,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profit_workout_categories`
--

DROP TABLE IF EXISTS `profit_workout_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `profit_workout_categories` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `amount` decimal(18,2) DEFAULT NULL,
  `category` varchar(255) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  `item_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKmnbrkem71rwww4lk3822f9jbu` (`item_id`),
  CONSTRAINT `FKmnbrkem71rwww4lk3822f9jbu` FOREIGN KEY (`item_id`) REFERENCES `profit_workout_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profit_workout_items`
--

DROP TABLE IF EXISTS `profit_workout_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `profit_workout_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(255) DEFAULT NULL,
  `cost` decimal(18,2) DEFAULT NULL,
  `cost_rate` decimal(18,2) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `description` text,
  `margin` decimal(10,2) DEFAULT NULL,
  `profit` decimal(18,2) DEFAULT NULL,
  `profit_per_unit` decimal(18,2) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `selling` decimal(18,2) DEFAULT NULL,
  `selling_rate` decimal(18,2) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  `profit_workout_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK1yau8cxtjx99can2vjb0tqhrw` (`profit_workout_id`),
  CONSTRAINT `FK1yau8cxtjx99can2vjb0tqhrw` FOREIGN KEY (`profit_workout_id`) REFERENCES `profit_workouts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profit_workout_timeline`
--

DROP TABLE IF EXISTS `profit_workout_timeline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `profit_workout_timeline` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `detail` text,
  `title` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `profit_workout_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKid92yq16jsp9agqa6bbsfcrkj` (`profit_workout_id`),
  CONSTRAINT `FKid92yq16jsp9agqa6bbsfcrkj` FOREIGN KEY (`profit_workout_id`) REFERENCES `profit_workouts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profit_workouts`
--

DROP TABLE IF EXISTS `profit_workouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `profit_workouts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `additional_charges` decimal(18,2) DEFAULT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `attachments_json` longtext,
  `billing_address` text,
  `company` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `cpr_ref` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(8) NOT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `discount_amt` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(10,2) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gst` varchar(255) DEFAULT NULL,
  `gst_amt` decimal(18,2) DEFAULT NULL,
  `gst_pct` decimal(10,2) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `linked_cpr` varchar(255) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `prepared_by` varchar(255) DEFAULT NULL,
  `profit_amt` decimal(18,2) DEFAULT NULL,
  `profit_pct` decimal(10,2) DEFAULT NULL,
  `project` varchar(255) DEFAULT NULL,
  `pw_date` datetime(6) DEFAULT NULL,
  `pw_no` varchar(40) NOT NULL,
  `rejection_reason` text,
  `remarks` text,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `selling_price` decimal(18,2) DEFAULT NULL,
  `shipping_address` text,
  `source_cw_id` bigint DEFAULT NULL,
  `source_cw_no` varchar(255) DEFAULT NULL,
  `source_lead` varchar(255) DEFAULT NULL,
  `status` enum('APPROVED','ARCHIVED','COMPLETED','DELETED','DRAFT','REJECTED','SUBMITTED') NOT NULL,
  `subtotal` decimal(18,2) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `cpr_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKkst352br07almn796c6e4wthx` (`pw_no`),
  KEY `FK6vlrxprs01mj9sxso93bhda4h` (`cpr_id`),
  CONSTRAINT `FK6vlrxprs01mj9sxso93bhda4h` FOREIGN KEY (`cpr_id`) REFERENCES `cprs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proforma_invoice_items`
--

DROP TABLE IF EXISTS `proforma_invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proforma_invoice_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `gst_rate` decimal(8,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `proforma_invoice_id` bigint NOT NULL,
  `country_of_origin` varchar(255) DEFAULT NULL,
  `delivery` varchar(255) DEFAULT NULL,
  `drawing_no` varchar(255) DEFAULT NULL,
  `gross_weight` decimal(18,3) DEFAULT NULL,
  `manufacturer` varchar(255) DEFAULT NULL,
  `marks_nos` varchar(255) DEFAULT NULL,
  `material` varchar(255) DEFAULT NULL,
  `net_weight` decimal(18,3) DEFAULT NULL,
  `no_kind_pkgs` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK6dh5i0uorbihfs3negxvyfe09` (`proforma_invoice_id`),
  CONSTRAINT `FK6dh5i0uorbihfs3negxvyfe09` FOREIGN KEY (`proforma_invoice_id`) REFERENCES `proforma_invoices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proforma_invoices`
--

DROP TABLE IF EXISTS `proforma_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proforma_invoices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `archived_at` datetime(6) DEFAULT NULL,
  `bank_account` varchar(255) DEFAULT NULL,
  `bank_branch` varchar(255) DEFAULT NULL,
  `bank_ifsc` varchar(255) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `bank_type` varchar(255) DEFAULT NULL,
  `bank_upi` varchar(255) DEFAULT NULL,
  `billing_address` text,
  `cgst_total` decimal(18,2) DEFAULT NULL,
  `charges` decimal(18,2) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `converted_to_invoice` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `discount` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `notes` text,
  `pan` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `pi_date` datetime(6) DEFAULT NULL,
  `pi_no` varchar(40) NOT NULL,
  `reference_no` varchar(255) DEFAULT NULL,
  `sgst_total` decimal(18,2) DEFAULT NULL,
  `ship_same_as_bill` bit(1) NOT NULL,
  `shipping_address` text,
  `source` varchar(255) DEFAULT NULL,
  `source_ref` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `sub_total` decimal(18,2) DEFAULT NULL,
  `tax_total` decimal(18,2) DEFAULT NULL,
  `terms` text,
  `updated_at` datetime(6) DEFAULT NULL,
  `valid_till` datetime(6) DEFAULT NULL,
  `converted_to_dc` varchar(255) DEFAULT NULL,
  `converted_to_so` varchar(255) DEFAULT NULL,
  `appendix_date` datetime(6) DEFAULT NULL,
  `appendix_po_no` varchar(255) DEFAULT NULL,
  `authorization_date` datetime(6) DEFAULT NULL,
  `authorized_signatory` varchar(255) DEFAULT NULL,
  `bank_acct_name` varchar(255) DEFAULT NULL,
  `bank_address` text,
  `bank_swift` varchar(255) DEFAULT NULL,
  `buyer_address` text,
  `buyer_country` varchar(255) DEFAULT NULL,
  `buyer_name` varchar(255) DEFAULT NULL,
  `buyer_same_as_consignee` bit(1) NOT NULL,
  `buyers_order_date` datetime(6) DEFAULT NULL,
  `buyers_order_no` varchar(255) DEFAULT NULL,
  `commodity` varchar(255) DEFAULT NULL,
  `company_stamp` longtext,
  `consignee_address` text,
  `consignee_country` varchar(255) DEFAULT NULL,
  `consignee_name` varchar(255) DEFAULT NULL,
  `contract_date` datetime(6) DEFAULT NULL,
  `contract_no` varchar(255) DEFAULT NULL,
  `converted_to_cn` varchar(255) DEFAULT NULL,
  `converted_to_pr` varchar(255) DEFAULT NULL,
  `country_of_final_destination` varchar(255) DEFAULT NULL,
  `country_of_origin` varchar(255) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `declaration` text,
  `designation` varchar(255) DEFAULT NULL,
  `exporter_address` text,
  `exporter_email` varchar(255) DEFAULT NULL,
  `exporter_gstin` varchar(255) DEFAULT NULL,
  `exporter_name` varchar(255) DEFAULT NULL,
  `exporter_pan` varchar(255) DEFAULT NULL,
  `exporter_phone` varchar(255) DEFAULT NULL,
  `exporter_ref` varchar(255) DEFAULT NULL,
  `exporter_state` varchar(255) DEFAULT NULL,
  `gross_weight` decimal(18,3) DEFAULT NULL,
  `hs_code` varchar(255) DEFAULT NULL,
  `hsn_view` varchar(255) DEFAULT NULL,
  `invoice_date` datetime(6) DEFAULT NULL,
  `invoice_no` varchar(255) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `net_weight` decimal(18,3) DEFAULT NULL,
  `package_dimensions` varchar(255) DEFAULT NULL,
  `package_marks_nos` varchar(255) DEFAULT NULL,
  `package_no_kind_pkgs` varchar(255) DEFAULT NULL,
  `packing_details` text,
  `payment_terms` varchar(255) DEFAULT NULL,
  `place` varchar(255) DEFAULT NULL,
  `place_of_delivery` varchar(255) DEFAULT NULL,
  `place_of_receipt` varchar(255) DEFAULT NULL,
  `port_of_discharge` varchar(255) DEFAULT NULL,
  `port_of_loading` varchar(255) DEFAULT NULL,
  `pre_carriage_by` varchar(255) DEFAULT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `tax_treatment` varchar(255) DEFAULT NULL,
  `tax_type` varchar(255) DEFAULT NULL,
  `terms_of_delivery` varchar(255) DEFAULT NULL,
  `total_packages` decimal(18,3) DEFAULT NULL,
  `total_qty` decimal(18,3) DEFAULT NULL,
  `vessel_flight_no` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKpg4mx8pkx827avuvwbjfmjrl3` (`pi_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_attachments`
--

DROP TABLE IF EXISTS `purchase_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `doc_id` bigint NOT NULL,
  `doc_type` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `uploaded_by` varchar(120) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `invoice_id` bigint DEFAULT NULL,
  `order_id` bigint DEFAULT NULL,
  `requisition_id` bigint DEFAULT NULL,
  `rfq_id` bigint DEFAULT NULL,
  `vendor_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_patt_doc` (`doc_type`,`doc_id`),
  KEY `FKr8xu40r5ny343b5h2arh1ymaa` (`invoice_id`),
  KEY `FK2svit6e31lsea5vdbt79kc8fp` (`order_id`),
  KEY `FKrllisn3ih5rca1agj8ahtsy1k` (`requisition_id`),
  KEY `FKhgowuqj85g5wp043smg8d52bp` (`rfq_id`),
  KEY `FK1fk07ansm16yk9npxkababbdx` (`vendor_id`),
  CONSTRAINT `FK1fk07ansm16yk9npxkababbdx` FOREIGN KEY (`vendor_id`) REFERENCES `purchase_vendors` (`id`),
  CONSTRAINT `FK2svit6e31lsea5vdbt79kc8fp` FOREIGN KEY (`order_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `FKhgowuqj85g5wp043smg8d52bp` FOREIGN KEY (`rfq_id`) REFERENCES `purchase_rfqs` (`id`),
  CONSTRAINT `FKr8xu40r5ny343b5h2arh1ymaa` FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices` (`id`),
  CONSTRAINT `FKrllisn3ih5rca1agj8ahtsy1k` FOREIGN KEY (`requisition_id`) REFERENCES `purchase_requisitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_grn_items`
--

DROP TABLE IF EXISTS `purchase_grn_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_grn_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `accepted_qty` decimal(14,3) DEFAULT NULL,
  `batch_serial` varchar(120) DEFAULT NULL,
  `ordered_qty` decimal(14,3) DEFAULT NULL,
  `pending_qty` decimal(14,3) DEFAULT NULL,
  `po_item_code` varchar(60) DEFAULT NULL,
  `previously_received_qty` decimal(14,3) DEFAULT NULL,
  `product` varchar(255) NOT NULL,
  `received_qty` decimal(14,3) DEFAULT NULL,
  `rejected_qty` decimal(14,3) DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `grn_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK3b9iwu5hconokr3hx11jy3i0e` (`grn_id`),
  CONSTRAINT `FK3b9iwu5hconokr3hx11jy3i0e` FOREIGN KEY (`grn_id`) REFERENCES `purchase_grns` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_grns`
--

DROP TABLE IF EXISTS `purchase_grns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_grns` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `grn_no` varchar(60) NOT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `po_no` varchar(60) NOT NULL,
  `receipt_date` date DEFAULT NULL,
  `received_by` varchar(120) DEFAULT NULL,
  `status` varchar(40) DEFAULT NULL,
  `supplier` varchar(160) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `warehouse` varchar(120) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK4y9qrk12x253bjmsy8fkn6ccf` (`grn_no`),
  KEY `idx_grn_no` (`grn_no`),
  KEY `idx_grn_po` (`po_no`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_inspections`
--

DROP TABLE IF EXISTS `purchase_inspections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_inspections` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `grn_no` varchar(60) NOT NULL,
  `inspection_date` date DEFAULT NULL,
  `inspection_no` varchar(60) NOT NULL,
  `inspector` varchar(120) DEFAULT NULL,
  `items_json` text,
  `rejection_reason` varchar(500) DEFAULT NULL,
  `remarks` varchar(1000) DEFAULT NULL,
  `status` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKrer1msrx5h2ukn4b26iuj96l6` (`inspection_no`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_inventory_movements`
--

DROP TABLE IF EXISTS `purchase_inventory_movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_inventory_movements` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `movement_no` varchar(30) NOT NULL,
  `sku` varchar(80) DEFAULT NULL,
  `product` varchar(255) DEFAULT NULL,
  `uom` varchar(20) DEFAULT NULL,
  `warehouse` varchar(120) DEFAULT NULL,
  `location` varchar(120) DEFAULT NULL,
  `from_warehouse` varchar(120) DEFAULT NULL,
  `to_warehouse` varchar(120) DEFAULT NULL,
  `from_location` varchar(120) DEFAULT NULL,
  `to_location` varchar(120) DEFAULT NULL,
  `direction` varchar(10) DEFAULT NULL,
  `before_qty` decimal(14,3) DEFAULT NULL,
  `delta` decimal(14,3) DEFAULT NULL,
  `after_qty` decimal(14,3) DEFAULT NULL,
  `type` varchar(40) DEFAULT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `notes` text,
  `transfer_ref` varchar(30) DEFAULT NULL,
  `counterpart_no` varchar(30) DEFAULT NULL,
  `reversal_of` varchar(30) DEFAULT NULL,
  `reversal_no` varchar(30) DEFAULT NULL,
  `reversal_on` date DEFAULT NULL,
  `inspection_no` varchar(60) DEFAULT NULL,
  `po_no` varchar(60) DEFAULT NULL,
  `grn_no` varchar(60) DEFAULT NULL,
  `updated_on` date DEFAULT NULL,
  `updated_by` varchar(120) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inv_no` (`movement_no`),
  KEY `idx_inv_no` (`movement_no`),
  KEY `idx_inv_item` (`sku`,`product`,`warehouse`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_invoices`
--

DROP TABLE IF EXISTS `purchase_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_invoices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `advice_status` varchar(20) DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `approval_history_json` text,
  `attachments_json` text,
  `charges` decimal(14,2) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `discount` decimal(6,2) DEFAULT NULL,
  `due_date` varchar(10) DEFAULT NULL,
  `freight` decimal(14,2) DEFAULT NULL,
  `grn_no` varchar(60) DEFAULT NULL,
  `gst` decimal(14,2) NOT NULL,
  `gst_type` varchar(60) DEFAULT NULL,
  `invoice_date` varchar(10) DEFAULT NULL,
  `invoice_no` varchar(60) NOT NULL,
  `invoice_type` varchar(30) DEFAULT NULL,
  `items_json` text,
  `match_detail_json` text,
  `match_status` varchar(30) NOT NULL,
  `notes` text,
  `paid_amount` decimal(16,2) NOT NULL,
  `payment_status` varchar(30) DEFAULT NULL,
  `payments_json` text,
  `po_no` varchar(60) NOT NULL,
  `retention` decimal(14,2) DEFAULT NULL,
  `status` varchar(30) NOT NULL,
  `tds` decimal(14,2) DEFAULT NULL,
  `total` decimal(16,2) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `vendor` varchar(160) NOT NULL,
  `vendor_email` varchar(120) DEFAULT NULL,
  `vendor_invoice_no` varchar(60) NOT NULL,
  `vendor_reference` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKjqbtbugo4ongdnp7hmvkbgjtd` (`invoice_no`),
  KEY `idx_pinv_status` (`status`),
  KEY `idx_pinv_po_no` (`po_no`),
  KEY `idx_pinv_vendor` (`vendor`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_manufacturing_jobs`
--

DROP TABLE IF EXISTS `purchase_manufacturing_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_manufacturing_jobs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mfr_no` varchar(30) NOT NULL,
  `po_no` varchar(60) NOT NULL,
  `vendor` varchar(160) NOT NULL,
  `product` varchar(255) DEFAULT NULL,
  `qty` decimal(14,3) DEFAULT '0.000',
  `packed_qty` decimal(14,3) DEFAULT '0.000',
  `status` varchar(40) DEFAULT 'In Production',
  `progress` int DEFAULT '0',
  `start_date` date DEFAULT NULL,
  `expected_date` date DEFAULT NULL,
  `warehouse` varchar(120) DEFAULT NULL,
  `notes` text,
  `items_json` text,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mfr_no` (`mfr_no`),
  KEY `idx_mfr_no` (`mfr_no`),
  KEY `idx_mfr_po` (`po_no`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_order_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `cancelled_qty` decimal(14,3) DEFAULT NULL,
  `category` varchar(80) DEFAULT NULL,
  `discount` decimal(6,2) DEFAULT NULL,
  `expected_date` varchar(10) DEFAULT NULL,
  `gst_rate` decimal(6,2) NOT NULL,
  `hsn` varchar(20) DEFAULT NULL,
  `item_code` varchar(60) DEFAULT NULL,
  `product` varchar(255) NOT NULL,
  `qty` decimal(14,3) NOT NULL,
  `rate` decimal(14,2) NOT NULL,
  `received_qty` decimal(14,3) DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `uom` varchar(20) DEFAULT NULL,
  `order_id` bigint NOT NULL,
  `line_order` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKdlxkihwo0gv3ygmc02cgos2g4` (`order_id`),
  CONSTRAINT `FKdlxkihwo0gv3ygmc02cgos2g4` FOREIGN KEY (`order_id`) REFERENCES `purchase_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `acknowledged_at` datetime(6) DEFAULT NULL,
  `acknowledged_by` varchar(120) DEFAULT NULL,
  `acknowledgement_ref` varchar(255) DEFAULT NULL,
  `advance_amount` decimal(16,2) DEFAULT NULL,
  `advance_percentage` decimal(6,2) DEFAULT NULL,
  `advance_status` varchar(30) DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `approval_date` datetime(6) DEFAULT NULL,
  `approval_status` varchar(20) NOT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `awarded_value` decimal(16,2) DEFAULT NULL,
  `balance_amount` decimal(16,2) DEFAULT NULL,
  `charges` decimal(14,2) NOT NULL,
  `cost_center` varchar(80) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(40) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `delivery_address` varchar(255) DEFAULT NULL,
  `delivery_date` varchar(10) DEFAULT NULL,
  `delivery_instructions` text,
  `delivery_status` varchar(20) DEFAULT NULL,
  `delivery_terms` varchar(40) DEFAULT NULL,
  `department` varchar(60) DEFAULT NULL,
  `discount` decimal(6,2) NOT NULL,
  `expected_date` varchar(10) DEFAULT NULL,
  `freight` decimal(14,2) DEFAULT NULL,
  `gst_type` varchar(60) DEFAULT NULL,
  `incoterm` varchar(20) DEFAULT NULL,
  `insurance` decimal(14,2) DEFAULT NULL,
  `internal_notes` text,
  `location` varchar(60) DEFAULT NULL,
  `nfa_id` varchar(40) DEFAULT NULL,
  `nfa_no` varchar(60) DEFAULT NULL,
  `notes` text,
  `order_date` varchar(10) DEFAULT NULL,
  `payment_terms_json` text,
  `payment_terms_required` bit(1) DEFAULT NULL,
  `po_no` varchar(60) NOT NULL,
  `pr_no` varchar(60) DEFAULT NULL,
  `project` varchar(120) DEFAULT NULL,
  `quotation_no` varchar(60) DEFAULT NULL,
  `reference` varchar(60) DEFAULT NULL,
  `rejected_by` varchar(255) DEFAULT NULL,
  `rejected_reason` varchar(255) DEFAULT NULL,
  `released_at` datetime(6) DEFAULT NULL,
  `released_by` varchar(255) DEFAULT NULL,
  `rfq_no` varchar(60) DEFAULT NULL,
  `status` varchar(60) NOT NULL,
  `terms` varchar(40) DEFAULT NULL,
  `terms_and_conditions` text,
  `title` varchar(200) NOT NULL,
  `transport_mode` varchar(20) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `vendor` varchar(160) NOT NULL,
  `vendor_notes` text,
  `warehouse` varchar(60) DEFAULT NULL,
  `warranty` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKhocigcx4568i6hq7xymoco77w` (`po_no`),
  KEY `idx_po_status` (`status`),
  KEY `idx_po_no` (`po_no`),
  KEY `idx_po_vendor` (`vendor`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_quotations`
--

DROP TABLE IF EXISTS `purchase_quotations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_quotations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `charges` decimal(16,2) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `delivery` int DEFAULT NULL,
  `discount` decimal(16,2) DEFAULT NULL,
  `freight` decimal(16,2) DEFAULT NULL,
  `insurance` decimal(16,2) DEFAULT NULL,
  `items_json` text,
  `lead_time` int DEFAULT NULL,
  `notes` text,
  `payment_terms` varchar(40) DEFAULT NULL,
  `quotation_no` varchar(60) NOT NULL,
  `rfq_no` varchar(60) NOT NULL,
  `score` decimal(5,2) NOT NULL,
  `status` varchar(20) NOT NULL,
  `submitted_on` varchar(10) DEFAULT NULL,
  `tax` decimal(16,2) DEFAULT NULL,
  `total` decimal(16,2) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `valid_until` varchar(20) DEFAULT NULL,
  `vendor` varchar(160) NOT NULL,
  `warranty` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK6xvn75711x86g24i7m5tgesg1` (`quotation_no`),
  KEY `idx_quote_rfq_no` (`rfq_no`),
  KEY `idx_quote_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_requisition_comments`
--

DROP TABLE IF EXISTS `purchase_requisition_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_requisition_comments` (
  `requisition_id` bigint NOT NULL,
  `comment_json` text,
  KEY `FKq3769cysxlvlhkuk7heb36b9j` (`requisition_id`),
  CONSTRAINT `FKq3769cysxlvlhkuk7heb36b9j` FOREIGN KEY (`requisition_id`) REFERENCES `purchase_requisitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_requisition_items`
--

DROP TABLE IF EXISTS `purchase_requisition_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_requisition_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(80) DEFAULT NULL,
  `discount` decimal(6,2) DEFAULT NULL,
  `gst_rate` decimal(6,2) NOT NULL,
  `hsn` varchar(20) DEFAULT NULL,
  `item_code` varchar(60) DEFAULT NULL,
  `product` varchar(255) NOT NULL,
  `qty` decimal(14,3) NOT NULL,
  `rate` decimal(14,2) NOT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `specification` varchar(500) DEFAULT NULL,
  `uom` varchar(20) DEFAULT NULL,
  `requisition_id` bigint NOT NULL,
  `line_order` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKs8cxt7ys60906wvji3yc353pl` (`requisition_id`),
  CONSTRAINT `FKs8cxt7ys60906wvji3yc353pl` FOREIGN KEY (`requisition_id`) REFERENCES `purchase_requisitions` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_requisitions`
--

DROP TABLE IF EXISTS `purchase_requisitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_requisitions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `amount` decimal(16,2) NOT NULL,
  `approval_date` datetime(6) DEFAULT NULL,
  `approval_note` text,
  `approval_status` varchar(20) NOT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `branch` varchar(120) DEFAULT NULL,
  `buyer` varchar(120) DEFAULT NULL,
  `charges` decimal(14,2) NOT NULL,
  `company` varchar(120) DEFAULT NULL,
  `cost_center` varchar(80) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(120) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `date` varchar(10) DEFAULT NULL,
  `delivery_address` varchar(255) DEFAULT NULL,
  `department` varchar(60) DEFAULT NULL,
  `discount` decimal(12,2) NOT NULL,
  `expected_date` varchar(10) DEFAULT NULL,
  `gst_type` varchar(60) DEFAULT NULL,
  `incoterm` varchar(20) DEFAULT NULL,
  `internal_notes` text,
  `location` varchar(60) DEFAULT NULL,
  `notes` text,
  `po_no` varchar(60) DEFAULT NULL,
  `pr_no` varchar(60) NOT NULL,
  `pr_type` varchar(60) DEFAULT NULL,
  `priority` varchar(20) DEFAULT NULL,
  `project` varchar(120) DEFAULT NULL,
  `record_state` varchar(20) NOT NULL,
  `rejected_by` varchar(255) DEFAULT NULL,
  `requester` varchar(120) DEFAULT NULL,
  `rfq_no` varchar(60) DEFAULT NULL,
  `status` varchar(60) NOT NULL,
  `technical_review_json` text,
  `terms` varchar(40) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `transport_mode` varchar(20) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(120) DEFAULT NULL,
  `vendor` varchar(160) DEFAULT NULL,
  `warehouse` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKh67ssg0uesbjfda8o6nxn4su` (`pr_no`),
  KEY `idx_pr_status` (`status`),
  KEY `idx_pr_record_state` (`record_state`),
  KEY `idx_pr_no` (`pr_no`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_rfq_evaluation_records`
--

DROP TABLE IF EXISTS `purchase_rfq_evaluation_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_rfq_evaluation_records` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `rfq_no` varchar(60) NOT NULL,
  `rfq_ref` varchar(60) DEFAULT NULL,
  `stage` varchar(60) DEFAULT NULL,
  `record_json` text,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rfq_eval_record_no` (`rfq_no`),
  KEY `idx_rfq_eval_record_no` (`rfq_no`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_rfq_followups`
--

DROP TABLE IF EXISTS `purchase_rfq_followups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_rfq_followups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `follow_up_no` varchar(60) NOT NULL,
  `rfq_no` varchar(60) NOT NULL,
  `vendor` varchar(160) DEFAULT NULL,
  `type` varchar(120) NOT NULL,
  `workflow_status` varchar(30) NOT NULL DEFAULT 'Pending',
  `follow_up_date` date NOT NULL,
  `follow_up_time` varchar(10) DEFAULT NULL,
  `priority` varchar(30) DEFAULT NULL,
  `assigned_to` varchar(120) DEFAULT NULL,
  `notes` text,
  `reminder` bit(1) DEFAULT NULL,
  `record_state` varchar(20) NOT NULL DEFAULT 'active',
  `last_contact` date DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_purchase_rfq_followup_no` (`follow_up_no`),
  KEY `idx_purchase_rfq_followup_rfq` (`rfq_no`),
  CONSTRAINT `fk_purchase_rfq_followup_rfq` FOREIGN KEY (`rfq_no`) REFERENCES `purchase_rfqs` (`rfq_no`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_rfq_items`
--

DROP TABLE IF EXISTS `purchase_rfq_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_rfq_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(80) DEFAULT NULL,
  `hsn` varchar(20) DEFAULT NULL,
  `item_code` varchar(60) DEFAULT NULL,
  `product` varchar(255) NOT NULL,
  `qty` decimal(14,3) NOT NULL,
  `rate` decimal(14,2) NOT NULL,
  `required_date` varchar(10) DEFAULT NULL,
  `specification` varchar(500) DEFAULT NULL,
  `uom` varchar(20) DEFAULT NULL,
  `rfq_id` bigint NOT NULL,
  `line_order` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK8odluxryka7hhyygkujc5rbmg` (`rfq_id`),
  CONSTRAINT `FK8odluxryka7hhyygkujc5rbmg` FOREIGN KEY (`rfq_id`) REFERENCES `purchase_rfqs` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_rfq_negotiations`
--

DROP TABLE IF EXISTS `purchase_rfq_negotiations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_rfq_negotiations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `rfq_no` varchar(60) NOT NULL,
  `vendor` varchar(200) DEFAULT NULL,
  `quotation_no` varchar(60) DEFAULT NULL,
  `vendor_ref` varchar(60) DEFAULT NULL,
  `round_no` int NOT NULL,
  `amount` decimal(18,2) DEFAULT NULL,
  `stage` varchar(40) DEFAULT NULL,
  `note` text,
  `actor` varchar(120) DEFAULT NULL,
  `item_rates_json` text,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rfq_negotiation_no` (`rfq_no`),
  KEY `idx_rfq_negotiation_vendor` (`vendor`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_rfqs`
--

DROP TABLE IF EXISTS `purchase_rfqs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_rfqs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `approval_status` varchar(20) NOT NULL,
  `awarded_at` datetime(6) DEFAULT NULL,
  `awarded_quote_id` varchar(60) DEFAULT NULL,
  `awarded_value` decimal(16,2) DEFAULT NULL,
  `awarded_vendor` varchar(160) DEFAULT NULL,
  `buyer` varchar(120) DEFAULT NULL,
  `category` varchar(80) DEFAULT NULL,
  `commercial_terms_json` text,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `delivery_address` varchar(255) DEFAULT NULL,
  `department` varchar(60) DEFAULT NULL,
  `description` text,
  `due_date` varchar(10) DEFAULT NULL,
  `estimated_value` decimal(16,2) DEFAULT NULL,
  `incoterm` varchar(20) DEFAULT NULL,
  `notes` text,
  `po_no` varchar(60) DEFAULT NULL,
  `pr_no` varchar(60) DEFAULT NULL,
  `priority` varchar(20) DEFAULT NULL,
  `project` varchar(120) DEFAULT NULL,
  `reference` varchar(60) DEFAULT NULL,
  `requester` varchar(120) DEFAULT NULL,
  `rfq_no` varchar(60) NOT NULL,
  `status` varchar(60) NOT NULL,
  `title` varchar(200) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `validity` int DEFAULT NULL,
  `vendor_names_json` text,
  `vendors_json` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKm28p1qegllk7v0ls5iv2g2oyg` (`rfq_no`),
  KEY `idx_rfq_status` (`status`),
  KEY `idx_rfq_no` (`rfq_no`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_shipments`
--

DROP TABLE IF EXISTS `purchase_shipments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_shipments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `shipment_no` varchar(30) NOT NULL,
  `po_no` varchar(60) NOT NULL,
  `packing_no` varchar(30) DEFAULT NULL,
  `vendor` varchar(160) NOT NULL,
  `carrier` varchar(120) DEFAULT NULL,
  `mode` varchar(40) DEFAULT 'Road',
  `dispatch_date` date DEFAULT NULL,
  `eta` date DEFAULT NULL,
  `destination` varchar(120) DEFAULT NULL,
  `status` varchar(40) DEFAULT 'Pending Dispatch',
  `tracking_no` varchar(120) DEFAULT NULL,
  `received_on` date DEFAULT NULL,
  `notes` text,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `shipment_no` (`shipment_no`),
  KEY `idx_ship_no` (`shipment_no`),
  KEY `idx_ship_po` (`po_no`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_timeline`
--

DROP TABLE IF EXISTS `purchase_timeline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_timeline` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actor` varchar(120) DEFAULT NULL,
  `device_info` varchar(500) DEFAULT NULL,
  `doc_id` bigint NOT NULL,
  `doc_type` varchar(20) NOT NULL,
  `ip_address` varchar(255) DEFAULT NULL,
  `label` varchar(200) NOT NULL,
  `new_value` varchar(120) DEFAULT NULL,
  `note` text,
  `old_value` varchar(120) DEFAULT NULL,
  `status` varchar(60) DEFAULT NULL,
  `timestamp` datetime(6) DEFAULT NULL,
  `type` varchar(40) NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `user_name` varchar(255) DEFAULT NULL,
  `user_role` varchar(255) DEFAULT NULL,
  `invoice_id` bigint DEFAULT NULL,
  `order_id` bigint DEFAULT NULL,
  `requisition_id` bigint DEFAULT NULL,
  `rfq_id` bigint DEFAULT NULL,
  `vendor_id` bigint DEFAULT NULL,
  `entry_order` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ptl_doc` (`doc_type`,`doc_id`),
  KEY `FKige6jk6obghxo6dr8x7okq8jp` (`invoice_id`),
  KEY `FKknj0dwdeb4yu3e1rqd4wbb25d` (`order_id`),
  KEY `FKr0bgk3v8knej5vjujc78gfmdf` (`requisition_id`),
  KEY `FK2ijlkw51aw8uf2q75lpt80r0i` (`rfq_id`),
  KEY `FK7i1b5edba63ggnxq1tnmauu2e` (`vendor_id`),
  CONSTRAINT `FK2ijlkw51aw8uf2q75lpt80r0i` FOREIGN KEY (`rfq_id`) REFERENCES `purchase_rfqs` (`id`),
  CONSTRAINT `FK7i1b5edba63ggnxq1tnmauu2e` FOREIGN KEY (`vendor_id`) REFERENCES `purchase_vendors` (`id`),
  CONSTRAINT `FKige6jk6obghxo6dr8x7okq8jp` FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices` (`id`),
  CONSTRAINT `FKknj0dwdeb4yu3e1rqd4wbb25d` FOREIGN KEY (`order_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `FKr0bgk3v8knej5vjujc78gfmdf` FOREIGN KEY (`requisition_id`) REFERENCES `purchase_requisitions` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=115 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_vendors`
--

DROP TABLE IF EXISTS `purchase_vendors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_vendors` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `active` bit(1) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `addresses_json` text,
  `categories_json` text,
  `category` varchar(80) DEFAULT NULL,
  `cin` varchar(40) DEFAULT NULL,
  `city` varchar(60) DEFAULT NULL,
  `contacts_json` text,
  `created_at` datetime(6) DEFAULT NULL,
  `credit_limit_json` text,
  `currency` varchar(10) DEFAULT NULL,
  `email` varchar(160) DEFAULT NULL,
  `formatted_address` varchar(255) DEFAULT NULL,
  `google_maps_url` varchar(255) DEFAULT NULL,
  `gstin` varchar(20) DEFAULT NULL,
  `incorporation_date` varchar(20) DEFAULT NULL,
  `latitude` double DEFAULT NULL,
  `lead_time_days` int DEFAULT NULL,
  `legal_name` varchar(120) DEFAULT NULL,
  `legal_type` varchar(60) DEFAULT NULL,
  `longitude` double DEFAULT NULL,
  `msme_reg_no` varchar(60) DEFAULT NULL,
  `msme_type` varchar(20) DEFAULT NULL,
  `name` varchar(160) NOT NULL,
  `notes` text,
  `payment_terms` varchar(30) DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `rating` decimal(3,1) NOT NULL,
  `record_state` varchar(20) NOT NULL,
  `registration_date` datetime(6) DEFAULT NULL,
  `state` varchar(60) DEFAULT NULL,
  `status` varchar(30) NOT NULL,
  `tan` varchar(20) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `vendor_code` varchar(40) NOT NULL,
  `website` varchar(160) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKafnry4ye6fkn8cmk4lgxn9w6w` (`vendor_code`),
  KEY `idx_vendor_status` (`status`),
  KEY `idx_vendor_record_state` (`record_state`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qform_attachments`
--

DROP TABLE IF EXISTS `qform_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qform_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `form_id` bigint NOT NULL,
  `label` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qform_part_list_entries`
--

DROP TABLE IF EXISTS `qform_part_list_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qform_part_list_entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `availability_of_sample` text,
  `dimensional_drawing` text,
  `form_id` bigint NOT NULL,
  `ga` text,
  `machine` varchar(80) NOT NULL,
  `sno` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qform_plant_contacts`
--

DROP TABLE IF EXISTS `qform_plant_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qform_plant_contacts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `department` varchar(80) NOT NULL,
  `form_id` bigint NOT NULL,
  `mail_id` varchar(255) DEFAULT NULL,
  `mobile` varchar(255) DEFAULT NULL,
  `person_in_charge` varchar(255) DEFAULT NULL,
  `sort_order` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qform_plant_oem_details`
--

DROP TABLE IF EXISTS `qform_plant_oem_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qform_plant_oem_details` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `atox` varchar(255) DEFAULT NULL,
  `buemer` varchar(255) DEFAULT NULL,
  `china` varchar(255) DEFAULT NULL,
  `christian_pfeiffer` varchar(255) DEFAULT NULL,
  `claudius_peters` varchar(255) DEFAULT NULL,
  `fl_smith` varchar(255) DEFAULT NULL,
  `form_id` bigint NOT NULL,
  `gebr_pfeiffer` varchar(255) DEFAULT NULL,
  `hammer_impact` varchar(255) DEFAULT NULL,
  `haver_booker` varchar(255) DEFAULT NULL,
  `ikn` varchar(255) DEFAULT NULL,
  `khd` varchar(255) DEFAULT NULL,
  `loesche` varchar(255) DEFAULT NULL,
  `machine` varchar(80) NOT NULL,
  `megatoux` varchar(255) DEFAULT NULL,
  `packing_oem_other` varchar(255) DEFAULT NULL,
  `pfeiffer` varchar(255) DEFAULT NULL,
  `pfeiffer_part_number` varchar(255) DEFAULT NULL,
  `polysius` varchar(255) DEFAULT NULL,
  `roller_fl_smith` varchar(255) DEFAULT NULL,
  `roller_ikn` varchar(255) DEFAULT NULL,
  `section` varchar(40) NOT NULL,
  `sinoma` varchar(255) DEFAULT NULL,
  `sort_order` int DEFAULT NULL,
  `vega` varchar(255) DEFAULT NULL,
  `vendomatic` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `quality_inspections`
--

DROP TABLE IF EXISTS `quality_inspections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quality_inspections` (
  `id` varchar(20) NOT NULL,
  `accepted_quantity` int DEFAULT NULL,
  `checklist` json DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `customer` varchar(200) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `dimensional_inspection` json DEFAULT NULL,
  `final_qc_info` json DEFAULT NULL,
  `history` json DEFAULT NULL,
  `inspection_date` date DEFAULT NULL,
  `inspection_id` varchar(20) DEFAULT NULL,
  `inspection_report` json DEFAULT NULL,
  `inspection_type` varchar(50) DEFAULT NULL,
  `inspector` varchar(100) DEFAULT NULL,
  `material_test_certificate` json DEFAULT NULL,
  `product` varchar(200) DEFAULT NULL,
  `production_order_id` varchar(50) DEFAULT NULL,
  `qc_updated_at` datetime(6) DEFAULT NULL,
  `quantity_inspected` int DEFAULT NULL,
  `rejected_quantity` int DEFAULT NULL,
  `remarks` text,
  `status` varchar(30) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  `work_order` varchar(50) DEFAULT NULL,
  `work_order_item_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `questionnaire_forms`
--

DROP TABLE IF EXISTS `questionnaire_forms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `questionnaire_forms` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `active_lines` int DEFAULT NULL,
  `approximate_pr_date` varchar(255) DEFAULT NULL,
  `authority_signature` mediumblob,
  `basic_remarks` text,
  `boss_command` text,
  `created_at` datetime(6) DEFAULT NULL,
  `date_of_visit` date DEFAULT NULL,
  `deleted` bit(1) NOT NULL,
  `geocoded_at` datetime(6) DEFAULT NULL,
  `latitude` decimal(38,2) DEFAULT NULL,
  `limestone_crusher_details` text,
  `location_address` varchar(255) DEFAULT NULL,
  `longitude` decimal(38,2) DEFAULT NULL,
  `marketer` varchar(255) DEFAULT NULL,
  `marketer_user_id` bigint NOT NULL,
  `marketing_lead_signature` mediumblob,
  `plant_location` varchar(255) DEFAULT NULL,
  `plant_name` varchar(255) DEFAULT NULL,
  `production_per_day` varchar(255) DEFAULT NULL,
  `shutdown_period` varchar(255) DEFAULT NULL,
  `status` varchar(255) NOT NULL,
  `submitted_at` datetime(6) DEFAULT NULL,
  `travel_plan_id` bigint DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `visit_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `quotation_items`
--

DROP TABLE IF EXISTS `quotation_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotation_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `gst_rate` decimal(8,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `quotation_id` bigint NOT NULL,
  `batch_code` varchar(255) DEFAULT NULL,
  `delivery` varchar(255) DEFAULT NULL,
  `drawing_no` varchar(255) DEFAULT NULL,
  `expiry_date` varchar(255) DEFAULT NULL,
  `material` varchar(255) DEFAULT NULL,
  `product_id` bigint DEFAULT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK7y587hckcncga8qtka1i06cbp` (`quotation_id`),
  CONSTRAINT `FK7y587hckcncga8qtka1i06cbp` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `quotations`
--

DROP TABLE IF EXISTS `quotations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `additional_info` text,
  `address` varchar(255) DEFAULT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  `billing_address` text,
  `billing_city` varchar(255) DEFAULT NULL,
  `billing_pin` varchar(255) DEFAULT NULL,
  `billing_state` varchar(255) DEFAULT NULL,
  `cgst_total` decimal(18,2) DEFAULT NULL,
  `charges` decimal(18,2) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(255) DEFAULT NULL,
  `converted_to_so` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `delivery_terms` varchar(255) DEFAULT NULL,
  `discount` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `display_unit` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `freight` decimal(18,2) DEFAULT NULL,
  `from_address` text,
  `from_company` varchar(255) DEFAULT NULL,
  `from_email` varchar(255) DEFAULT NULL,
  `from_gstin` varchar(255) DEFAULT NULL,
  `from_name` varchar(255) DEFAULT NULL,
  `from_pan` varchar(255) DEFAULT NULL,
  `from_phone` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `hsn_view` varchar(255) DEFAULT NULL,
  `insurance` decimal(18,2) DEFAULT NULL,
  `lead_no` varchar(255) DEFAULT NULL,
  `number_format` varchar(255) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `pin` varchar(255) DEFAULT NULL,
  `quotation_date` datetime(6) DEFAULT NULL,
  `quotation_no` varchar(40) NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `remarks` text,
  `sales_person` varchar(255) DEFAULT NULL,
  `sgst_total` decimal(18,2) DEFAULT NULL,
  `ship_same_as_bill` bit(1) NOT NULL,
  `shipping_address` text,
  `shipping_city` varchar(255) DEFAULT NULL,
  `shipping_pin` varchar(255) DEFAULT NULL,
  `shipping_state` varchar(255) DEFAULT NULL,
  `signature_label` varchar(255) DEFAULT NULL,
  `signature_type` varchar(255) DEFAULT NULL,
  `source_cpr` varchar(255) DEFAULT NULL,
  `source_cw` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `sub_total` decimal(18,2) DEFAULT NULL,
  `tax_total` decimal(18,2) DEFAULT NULL,
  `tax_type` varchar(255) DEFAULT NULL,
  `terms` text,
  `updated_at` datetime(6) DEFAULT NULL,
  `valid_until` datetime(6) DEFAULT NULL,
  `base_currency` varchar(10) DEFAULT NULL,
  `converted_to_cn` varchar(255) DEFAULT NULL,
  `converted_to_invoice` varchar(255) DEFAULT NULL,
  `converted_to_pi` varchar(255) DEFAULT NULL,
  `converted_to_pr` varchar(255) DEFAULT NULL,
  `exchange_rate` decimal(24,10) DEFAULT NULL,
  `batch` bit(1) DEFAULT NULL,
  `converted_to_dc` varchar(255) DEFAULT NULL,
  `converted_to_sc` varchar(255) DEFAULT NULL,
  `custom_fields` text,
  `desc_full` bit(1) DEFAULT NULL,
  `hide_place` bit(1) DEFAULT NULL,
  `hide_subtotal` bit(1) DEFAULT NULL,
  `hsn_summary` bit(1) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `original_images` bit(1) DEFAULT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `serial` bit(1) DEFAULT NULL,
  `show_sku` bit(1) DEFAULT NULL,
  `tax_summary` bit(1) DEFAULT NULL,
  `thumbnails` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKfdjel7i6rlwucc3gy6o9undrw` (`quotation_no`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `record_revisions`
--

DROP TABLE IF EXISTS `record_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `record_revisions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `changed_by` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `module_type` varchar(40) NOT NULL,
  `record_id` bigint NOT NULL,
  `snapshot_json` text,
  `version` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `refresh_tokens`
--

DROP TABLE IF EXISTS `refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refresh_tokens` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `family_id` varchar(36) NOT NULL,
  `revoked_at` datetime(6) DEFAULT NULL,
  `revoked_reason` varchar(20) DEFAULT NULL,
  `token_hash` varchar(64) NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_refresh_token_hash` (`token_hash`),
  KEY `idx_refresh_token_user` (`user_id`),
  KEY `idx_refresh_token_family` (`family_id`)
) ENGINE=InnoDB AUTO_INCREMENT=346 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_attachments`
--

DROP TABLE IF EXISTS `sales_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content_type` varchar(255) DEFAULT NULL,
  `module_id` bigint NOT NULL,
  `module_type` varchar(40) NOT NULL,
  `name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sales_attachments_module` (`module_type`,`module_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_contract_items`
--

DROP TABLE IF EXISTS `sales_contract_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_contract_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `gst_rate` decimal(8,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `sales_contract_id` bigint NOT NULL,
  `delivery` varchar(255) DEFAULT NULL,
  `drawing_no` varchar(255) DEFAULT NULL,
  `material` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKcbdv48glmoaw197h2n8cq8px1` (`sales_contract_id`),
  CONSTRAINT `FKcbdv48glmoaw197h2n8cq8px1` FOREIGN KEY (`sales_contract_id`) REFERENCES `sales_contracts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_contracts`
--

DROP TABLE IF EXISTS `sales_contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_contracts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `archived_at` datetime(6) DEFAULT NULL,
  `billing_address` text,
  `cgst_total` decimal(18,2) DEFAULT NULL,
  `charges` decimal(18,2) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `commercial_terms` text,
  `contact_person` varchar(255) DEFAULT NULL,
  `contract_date` datetime(6) DEFAULT NULL,
  `converted_to_so` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `delivery_terms` varchar(255) DEFAULT NULL,
  `discount` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `duration` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `exclusions` text,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `lead_no` varchar(255) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `po_ref` varchar(255) DEFAULT NULL,
  `qtn_ref` varchar(255) DEFAULT NULL,
  `remarks` text,
  `sales_executive` varchar(255) DEFAULT NULL,
  `sc_no` varchar(40) NOT NULL,
  `scope` text,
  `sgst_total` decimal(18,2) DEFAULT NULL,
  `shipping_address` text,
  `state` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `sub_total` decimal(18,2) DEFAULT NULL,
  `tax_total` decimal(18,2) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `validity` datetime(6) DEFAULT NULL,
  `warranty` varchar(255) DEFAULT NULL,
  `converted_to_cn` varchar(255) DEFAULT NULL,
  `converted_to_dc` varchar(255) DEFAULT NULL,
  `converted_to_invoice` varchar(255) DEFAULT NULL,
  `converted_to_pi` varchar(255) DEFAULT NULL,
  `converted_to_pr` varchar(255) DEFAULT NULL,
  `hsn_view` varchar(255) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `tax_type` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK89706swo0q9faamlmmby44klc` (`sc_no`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_history`
--

DROP TABLE IF EXISTS `sales_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `changed_by` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `field` varchar(255) DEFAULT NULL,
  `module_id` bigint NOT NULL,
  `module_type` varchar(40) NOT NULL,
  `new_value` text,
  `old_value` text,
  PRIMARY KEY (`id`),
  KEY `idx_sales_history_module` (`module_type`,`module_id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_order_items`
--

DROP TABLE IF EXISTS `sales_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_order_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `gst_rate` decimal(8,2) DEFAULT NULL,
  `hsn` varchar(255) DEFAULT NULL,
  `qty` decimal(18,3) DEFAULT NULL,
  `rate` decimal(18,2) DEFAULT NULL,
  `sku` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `sales_order_id` bigint NOT NULL,
  `delivery` varchar(255) DEFAULT NULL,
  `drawing_no` varchar(255) DEFAULT NULL,
  `material` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKtrge001xfy0fc9961g11411re` (`sales_order_id`),
  CONSTRAINT `FKtrge001xfy0fc9961g11411re` FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_orders`
--

DROP TABLE IF EXISTS `sales_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `archived_at` datetime(6) DEFAULT NULL,
  `billing_address` text,
  `cgst_total` decimal(18,2) DEFAULT NULL,
  `charges` decimal(18,2) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `client_id` bigint DEFAULT NULL,
  `client_name` varchar(255) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `converted_to_dc` varchar(255) DEFAULT NULL,
  `converted_to_inv` varchar(255) DEFAULT NULL,
  `converted_to_proforma` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `customer_po` varchar(255) DEFAULT NULL,
  `delivery_date` datetime(6) DEFAULT NULL,
  `delivery_terms` varchar(255) DEFAULT NULL,
  `discount` decimal(18,2) DEFAULT NULL,
  `discount_pct` decimal(8,2) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `grand_total` decimal(18,2) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `lead_no` varchar(255) DEFAULT NULL,
  `order_date` datetime(6) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `priority` varchar(255) DEFAULT NULL,
  `qtn_ref` varchar(255) DEFAULT NULL,
  `remarks` text,
  `sales_executive` varchar(255) DEFAULT NULL,
  `sc_ref` varchar(255) DEFAULT NULL,
  `sgst_total` decimal(18,2) DEFAULT NULL,
  `shipping_address` text,
  `so_no` varchar(40) NOT NULL,
  `state` varchar(255) DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `sub_total` decimal(18,2) DEFAULT NULL,
  `tax_total` decimal(18,2) DEFAULT NULL,
  `terms` text,
  `updated_at` datetime(6) DEFAULT NULL,
  `converted_to_cn` varchar(255) DEFAULT NULL,
  `converted_to_pr` varchar(255) DEFAULT NULL,
  `hsn_view` varchar(255) DEFAULT NULL,
  `latest_revision` bit(1) NOT NULL,
  `revision` int NOT NULL,
  `revision_date` datetime(6) DEFAULT NULL,
  `revision_of` bigint DEFAULT NULL,
  `tax_type` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKm2pqxnx76v2js1b5yuopohlsv` (`so_no`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_timeline`
--

DROP TABLE IF EXISTS `sales_timeline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_timeline` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `detail` text,
  `module_id` bigint NOT NULL,
  `module_type` varchar(40) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sales_timeline_module` (`module_type`,`module_id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `technical_verifications`
--

DROP TABLE IF EXISTS `technical_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `technical_verifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `casting_weight` varchar(50) DEFAULT NULL,
  `checklist` text,
  `created_by` varchar(255) DEFAULT NULL,
  `diameter` varchar(50) DEFAULT NULL,
  `dimensions` varchar(255) DEFAULT NULL,
  `drawing_number` varchar(100) DEFAULT NULL,
  `drawing_revision` varchar(50) DEFAULT NULL,
  `hard_facing_requirement` text,
  `heat_treatment_requirement` text,
  `item_code` varchar(100) DEFAULT NULL,
  `item_id` varchar(100) DEFAULT NULL,
  `item_product` varchar(255) DEFAULT NULL,
  `joint_type` varchar(100) DEFAULT NULL,
  `length_mm` varchar(50) DEFAULT NULL,
  `machining_allowance` varchar(100) DEFAULT NULL,
  `material_grade` varchar(200) DEFAULT NULL,
  `material_type` varchar(100) DEFAULT NULL,
  `pattern_number` varchar(100) DEFAULT NULL,
  `pattern_revision` varchar(50) DEFAULT NULL,
  `production_order_number` varchar(50) DEFAULT NULL,
  `production_type` varchar(30) DEFAULT NULL,
  `required_quantity` int DEFAULT NULL,
  `required_tolerance` varchar(100) DEFAULT NULL,
  `special_instructions` text,
  `specification` text,
  `surface_treatment` varchar(200) DEFAULT NULL,
  `technical_instructions` text,
  `thickness` varchar(50) DEFAULT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  `verification_datetime` datetime(6) DEFAULT NULL,
  `verification_remarks` text,
  `verification_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `weld_type` varchar(100) DEFAULT NULL,
  `welding_process` varchar(100) DEFAULT NULL,
  `welding_specification` varchar(200) DEFAULT NULL,
  `width` varchar(50) DEFAULT NULL,
  `work_order_id` varchar(20) NOT NULL,
  `work_order_number` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKsapdgsbx47txhic8yg4l72b3m` (`work_order_id`,`item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timeline_events`
--

DROP TABLE IF EXISTS `timeline_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeline_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `event_name` varchar(200) NOT NULL,
  `event_time` datetime(6) NOT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `remarks` text,
  `status` varchar(50) DEFAULT NULL,
  `production_order_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKe54qykp1i9xqron1tlypp47x5` (`production_order_id`),
  CONSTRAINT `FKe54qykp1i9xqron1tlypp47x5` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tv_history`
--

DROP TABLE IF EXISTS `tv_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tv_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `from_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `performed_at` datetime(6) NOT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `remarks` text,
  `to_status` enum('PENDING','REJECTED','VERIFIED') DEFAULT NULL,
  `technical_verification_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKbvpa98pmot2yb7m9ngpe1ptg8` (`technical_verification_id`),
  CONSTRAINT `FKbvpa98pmot2yb7m9ngpe1ptg8` FOREIGN KEY (`technical_verification_id`) REFERENCES `technical_verifications` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(190) NOT NULL,
  `enabled` bit(1) NOT NULL,
  `full_name` varchar(190) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('ADMIN','MANAGER','USER') NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `account_expired` bit(1) NOT NULL,
  `credentials_expired` bit(1) NOT NULL,
  `locked` bit(1) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK6dotkott2kjsp8vw4d0m25fb7` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `visit_change_history`
--

DROP TABLE IF EXISTS `visit_change_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit_change_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `change_type` varchar(255) NOT NULL,
  `changed_at` datetime(6) NOT NULL,
  `changed_by` varchar(255) DEFAULT NULL,
  `field_key` varchar(255) NOT NULL,
  `field_name` varchar(255) NOT NULL,
  `new_value` text,
  `old_value` text,
  `visit_id` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-19 13:11:49
