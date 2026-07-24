-- MySQL dump 10.13  Distrib 9.7.1, for Linux (x86_64)
--
-- Host: localhost    Database: mail
-- ------------------------------------------------------
-- Server version	9.7.1

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
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '625492c2-876c-11f1-96f5-9a4725fa2adc:1-19';

--
-- Current Database: `mail`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `mail` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `mail`;

--
-- Table structure for table `virtual_aliases`
--

DROP TABLE IF EXISTS `virtual_aliases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `virtual_aliases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `domain_id` int NOT NULL,
  `source` varchar(255) NOT NULL,
  `destination` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `domain_id` (`domain_id`),
  CONSTRAINT `virtual_aliases_ibfk_1` FOREIGN KEY (`domain_id`) REFERENCES `virtual_domains` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `virtual_aliases`
--

LOCK TABLES `virtual_aliases` WRITE;
/*!40000 ALTER TABLE `virtual_aliases` DISABLE KEYS */;
/*!40000 ALTER TABLE `virtual_aliases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `virtual_domains`
--

DROP TABLE IF EXISTS `virtual_domains`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `virtual_domains` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `virtual_domains`
--

LOCK TABLES `virtual_domains` WRITE;
/*!40000 ALTER TABLE `virtual_domains` DISABLE KEYS */;
INSERT INTO `virtual_domains` VALUES (1,'mail.example.com');
/*!40000 ALTER TABLE `virtual_domains` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `virtual_users`
--

DROP TABLE IF EXISTS `virtual_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `virtual_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `domain_id` int NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `domain_id` (`domain_id`),
  CONSTRAINT `virtual_users_ibfk_1` FOREIGN KEY (`domain_id`) REFERENCES `virtual_domains` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `virtual_users`
--

LOCK TABLES `virtual_users` WRITE;
/*!40000 ALTER TABLE `virtual_users` DISABLE KEYS */;
INSERT INTO `virtual_users` VALUES (1,1,'maya@mail.example.com','{BLF-CRYPT}$2b$10$aoWMwHtHNiSsscP9S8fNBu3tckWvTOwkTtMgOs7PX2Tdhuia1OWnC','2026-07-24 15:01:41'),(2,1,'jordan@mail.example.com','{BLF-CRYPT}$2a$10$X6J3xp.xALkwbxtuXV6/HenKkwT.ANM1YgVavhOqb3y3xkLqMEdtq','2026-07-24 15:12:28'),(3,1,'newuser@mail.example.com','{BLF-CRYPT}$2a$10$uen6fiyjrXZD1QzxlX6zU.WaY8HUhPM/GMHLg6qNU17lB0rmWZZhS','2026-07-24 15:21:58');
/*!40000 ALTER TABLE `virtual_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'mail'
--
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-24 15:22:33
