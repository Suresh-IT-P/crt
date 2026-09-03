CREATE TABLE `abort_rejections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int DEFAULT NULL,
  `driver_id` int DEFAULT NULL,
  `original_reason` text,
  `admin_note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `passengers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `otp_verified` tinyint DEFAULT '0',
  `banned_until` timestamp NULL DEFAULT NULL,
  `is_blocked` tinyint DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tariffs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_type` varchar(50) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `config` json DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_abort_rejections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int DEFAULT NULL,
  `driver_id` int DEFAULT NULL,
  `original_reason` text,
  `admin_note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_association_tariffs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `association_id` int NOT NULL,
  `trip_type` varchar(20) NOT NULL,
  `vehicle_type` varchar(20) NOT NULL,
  `config` json DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_assoc_tariff` (`association_id`,`trip_type`,`vehicle_type`),
  CONSTRAINT `taxi_association_tariffs_ibfk_1` FOREIGN KEY (`association_id`) REFERENCES `taxi_associations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_association_wallet_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `association_id` int DEFAULT NULL,
  `booking_id` int DEFAULT NULL,
  `driver_id` int DEFAULT NULL,
  `type` enum('credit','debit') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `association_id` (`association_id`),
  CONSTRAINT `taxi_association_wallet_transactions_ibfk_1` FOREIGN KEY (`association_id`) REFERENCES `taxi_associations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_association_wallets` (
  `association_id` int NOT NULL,
  `balance` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`association_id`),
  CONSTRAINT `taxi_association_wallets_ibfk_1` FOREIGN KEY (`association_id`) REFERENCES `taxi_associations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_associations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `city_name` varchar(100) NOT NULL,
  `admin_username` varchar(50) NOT NULL,
  `admin_password` varchar(255) NOT NULL,
  `commission_type` enum('percentage','fixed') DEFAULT 'percentage',
  `commission_value` decimal(10,2) DEFAULT '0.00',
  `geofence_radius` decimal(10,2) DEFAULT '50.00',
  `is_active` tinyint DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_username` (`admin_username`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_booking_calls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `caller_role` varchar(20) NOT NULL,
  `caller_name` varchar(100) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ringing',
  `started_at` datetime NOT NULL,
  `answered_at` datetime DEFAULT NULL,
  `ended_at` datetime DEFAULT NULL,
  `duration_seconds` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_booking_calls` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_booking_chats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `sender_role` varchar(20) NOT NULL,
  `sender_name` varchar(100) DEFAULT NULL,
  `message` text NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_booking` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `pickup_loc` text,
  `pickup_coords` varchar(100) DEFAULT NULL,
  `drop_loc` text,
  `drop_coords` varchar(100) DEFAULT NULL,
  `extra_drops` text,
  `pickup_date` date DEFAULT NULL,
  `pickup_time` time DEFAULT NULL,
  `passengers` int DEFAULT NULL,
  `vehicle_type` varchar(50) DEFAULT NULL,
  `trip_type` varchar(50) DEFAULT NULL,
  `fare` varchar(20) DEFAULT NULL,
  `status` enum('pending','assigned','vendor_assigned','pending_vendor_assignment','ongoing','finished','completed','cancelled','cancel_requested') DEFAULT 'pending',
  `journey_otp` varchar(10) DEFAULT NULL,
  `cancel_reason` text,
  `driver_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `distance` varchar(50) DEFAULT NULL,
  `vendor_id` int DEFAULT NULL,
  `vendor_markup` decimal(10,2) DEFAULT '0.00',
  `start_odometer` int DEFAULT NULL,
  `end_odometer` int DEFAULT NULL,
  `journey_start_time` datetime DEFAULT NULL,
  `journey_end_time` datetime DEFAULT NULL,
  `rental_package` varchar(50) DEFAULT NULL,
  `passenger_name` varchar(100) DEFAULT NULL,
  `passenger_phone` varchar(20) DEFAULT NULL,
  `actual_distance` varchar(50) DEFAULT NULL,
  `is_deviated` tinyint DEFAULT '0',
  `original_fare` varchar(50) DEFAULT NULL,
  `return_date` date DEFAULT NULL,
  `start_gps_coords` varchar(100) DEFAULT NULL,
  `end_gps_coords` varchar(100) DEFAULT NULL,
  `estimated_distance` varchar(50) DEFAULT NULL,
  `estimated_fare` varchar(50) DEFAULT NULL,
  `estimated_duration` varchar(50) DEFAULT NULL,
  `dynamic_distance` varchar(50) DEFAULT NULL,
  `dynamic_fare` varchar(50) DEFAULT NULL,
  `reached_pickup_time` datetime DEFAULT NULL,
  `end_otp` varchar(10) DEFAULT NULL,
  `rating` tinyint DEFAULT NULL,
  `rating_comment` text,
  `special_place_type` varchar(50) DEFAULT NULL,
  `seating_capacity` int DEFAULT '4',
  `driver_accept_required` tinyint DEFAULT '0',
  `association_id` int DEFAULT NULL,
  `air_distance_boost_km` float DEFAULT '0',
  `pickup_incentive_fare` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `idx_bookings_user_id` (`user_id`),
  KEY `idx_bookings_driver_id` (`driver_id`),
  KEY `idx_bookings_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_driver_applications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `profile_photo` longtext,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `car_model` varchar(50) DEFAULT NULL,
  `car_number` varchar(20) DEFAULT NULL,
  `vehicle_type` varchar(50) DEFAULT 'sedan',
  `dl_front` longtext,
  `dl_back` longtext,
  `pvc` longtext,
  `aadhar_front` longtext,
  `aadhar_back` longtext,
  `rc_book` longtext,
  `insurance` longtext,
  `pollution` longtext,
  `permit` longtext,
  `payment_qr` longtext,
  `pref_loc_1` varchar(100) DEFAULT NULL,
  `pref_loc_2` varchar(100) DEFAULT NULL,
  `pref_loc_3` varchar(100) DEFAULT NULL,
  `ride_local` tinyint DEFAULT '1',
  `ride_oneway` tinyint DEFAULT '1',
  `ride_round` tinyint DEFAULT '1',
  `seating_capacity` int DEFAULT '5',
  `status` varchar(20) DEFAULT 'pending',
  `admin_note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `district` varchar(100) DEFAULT NULL,
  `association_id` int DEFAULT NULL,
  `association_name` varchar(150) DEFAULT 'CityRide Driver (Independent)',
  `association_id_card` longtext,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `phone` (`phone`),
  UNIQUE KEY `phone_2` (`phone`),
  UNIQUE KEY `phone_3` (`phone`),
  UNIQUE KEY `phone_4` (`phone`),
  UNIQUE KEY `phone_5` (`phone`),
  UNIQUE KEY `phone_6` (`phone`),
  UNIQUE KEY `phone_7` (`phone`),
  UNIQUE KEY `phone_8` (`phone`),
  UNIQUE KEY `phone_9` (`phone`),
  UNIQUE KEY `phone_10` (`phone`),
  UNIQUE KEY `phone_11` (`phone`),
  UNIQUE KEY `phone_12` (`phone`),
  UNIQUE KEY `phone_13` (`phone`),
  UNIQUE KEY `phone_14` (`phone`),
  UNIQUE KEY `phone_15` (`phone`),
  UNIQUE KEY `phone_16` (`phone`),
  UNIQUE KEY `phone_17` (`phone`),
  UNIQUE KEY `phone_18` (`phone`),
  UNIQUE KEY `phone_19` (`phone`),
  UNIQUE KEY `phone_20` (`phone`),
  UNIQUE KEY `phone_21` (`phone`),
  UNIQUE KEY `phone_22` (`phone`),
  UNIQUE KEY `phone_23` (`phone`),
  UNIQUE KEY `phone_24` (`phone`),
  UNIQUE KEY `phone_25` (`phone`),
  UNIQUE KEY `phone_26` (`phone`),
  UNIQUE KEY `phone_27` (`phone`),
  UNIQUE KEY `phone_28` (`phone`),
  UNIQUE KEY `phone_29` (`phone`),
  UNIQUE KEY `phone_30` (`phone`),
  UNIQUE KEY `phone_31` (`phone`),
  UNIQUE KEY `phone_32` (`phone`),
  UNIQUE KEY `phone_33` (`phone`),
  UNIQUE KEY `phone_34` (`phone`),
  UNIQUE KEY `phone_35` (`phone`),
  UNIQUE KEY `phone_36` (`phone`),
  UNIQUE KEY `phone_37` (`phone`),
  UNIQUE KEY `phone_38` (`phone`),
  UNIQUE KEY `phone_39` (`phone`),
  UNIQUE KEY `phone_40` (`phone`),
  UNIQUE KEY `phone_41` (`phone`),
  UNIQUE KEY `phone_42` (`phone`),
  UNIQUE KEY `phone_43` (`phone`),
  UNIQUE KEY `phone_44` (`phone`),
  UNIQUE KEY `phone_45` (`phone`),
  UNIQUE KEY `phone_46` (`phone`),
  UNIQUE KEY `phone_47` (`phone`),
  UNIQUE KEY `phone_48` (`phone`),
  UNIQUE KEY `phone_49` (`phone`),
  UNIQUE KEY `phone_50` (`phone`),
  UNIQUE KEY `phone_51` (`phone`),
  UNIQUE KEY `phone_52` (`phone`),
  UNIQUE KEY `phone_53` (`phone`),
  UNIQUE KEY `phone_54` (`phone`),
  UNIQUE KEY `phone_55` (`phone`),
  UNIQUE KEY `phone_56` (`phone`),
  UNIQUE KEY `phone_57` (`phone`),
  UNIQUE KEY `phone_58` (`phone`),
  UNIQUE KEY `phone_59` (`phone`),
  UNIQUE KEY `phone_60` (`phone`),
  UNIQUE KEY `phone_61` (`phone`),
  UNIQUE KEY `phone_62` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_drivers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `profile_photo` longtext,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `car_model` varchar(50) DEFAULT NULL,
  `car_number` varchar(20) DEFAULT NULL,
  `vehicle_type` varchar(50) DEFAULT 'sedan',
  `wallet_balance` decimal(10,2) DEFAULT '0.00',
  `is_blocked` tinyint DEFAULT '0',
  `approval_status` varchar(20) DEFAULT 'approved',
  `dl_front` longtext,
  `dl_back` longtext,
  `pvc` longtext,
  `aadhar_front` longtext,
  `aadhar_back` longtext,
  `rc_book` longtext,
  `insurance` longtext,
  `pollution` longtext,
  `permit` longtext,
  `payment_qr` longtext,
  `pref_loc_1` varchar(100) DEFAULT NULL,
  `pref_loc_2` varchar(100) DEFAULT NULL,
  `pref_loc_3` varchar(100) DEFAULT NULL,
  `ride_local` tinyint DEFAULT '1',
  `ride_oneway` tinyint DEFAULT '1',
  `ride_round` tinyint DEFAULT '1',
  `seating_capacity` int DEFAULT '5',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `association_id` int DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `is_online` tinyint DEFAULT '0',
  `district` varchar(100) DEFAULT NULL,
  `association_name` varchar(150) DEFAULT 'CityRide Driver (Independent)',
  `association_id_card` longtext,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `phone` (`phone`),
  UNIQUE KEY `phone_2` (`phone`),
  UNIQUE KEY `phone_3` (`phone`),
  UNIQUE KEY `phone_4` (`phone`),
  UNIQUE KEY `phone_5` (`phone`),
  UNIQUE KEY `phone_6` (`phone`),
  UNIQUE KEY `phone_7` (`phone`),
  UNIQUE KEY `phone_8` (`phone`),
  UNIQUE KEY `phone_9` (`phone`),
  UNIQUE KEY `phone_10` (`phone`),
  UNIQUE KEY `phone_11` (`phone`),
  UNIQUE KEY `phone_12` (`phone`),
  UNIQUE KEY `phone_13` (`phone`),
  UNIQUE KEY `phone_14` (`phone`),
  UNIQUE KEY `phone_15` (`phone`),
  UNIQUE KEY `phone_16` (`phone`),
  UNIQUE KEY `phone_17` (`phone`),
  UNIQUE KEY `phone_18` (`phone`),
  UNIQUE KEY `phone_19` (`phone`),
  UNIQUE KEY `phone_20` (`phone`),
  UNIQUE KEY `phone_21` (`phone`),
  UNIQUE KEY `phone_22` (`phone`),
  UNIQUE KEY `phone_23` (`phone`),
  UNIQUE KEY `phone_24` (`phone`),
  UNIQUE KEY `phone_25` (`phone`),
  UNIQUE KEY `phone_26` (`phone`),
  UNIQUE KEY `phone_27` (`phone`),
  UNIQUE KEY `phone_28` (`phone`),
  UNIQUE KEY `phone_29` (`phone`),
  UNIQUE KEY `phone_30` (`phone`),
  UNIQUE KEY `phone_31` (`phone`),
  UNIQUE KEY `phone_32` (`phone`),
  UNIQUE KEY `phone_33` (`phone`),
  UNIQUE KEY `phone_34` (`phone`),
  UNIQUE KEY `phone_35` (`phone`),
  UNIQUE KEY `phone_36` (`phone`),
  UNIQUE KEY `phone_37` (`phone`),
  UNIQUE KEY `phone_38` (`phone`),
  UNIQUE KEY `phone_39` (`phone`),
  UNIQUE KEY `phone_40` (`phone`),
  UNIQUE KEY `phone_41` (`phone`),
  UNIQUE KEY `phone_42` (`phone`),
  UNIQUE KEY `phone_43` (`phone`),
  UNIQUE KEY `phone_44` (`phone`),
  UNIQUE KEY `phone_45` (`phone`),
  UNIQUE KEY `phone_46` (`phone`),
  UNIQUE KEY `phone_47` (`phone`),
  UNIQUE KEY `phone_48` (`phone`),
  UNIQUE KEY `phone_49` (`phone`),
  UNIQUE KEY `phone_50` (`phone`),
  UNIQUE KEY `phone_51` (`phone`),
  UNIQUE KEY `phone_52` (`phone`),
  UNIQUE KEY `phone_53` (`phone`),
  UNIQUE KEY `phone_54` (`phone`),
  UNIQUE KEY `phone_55` (`phone`),
  UNIQUE KEY `phone_56` (`phone`),
  UNIQUE KEY `phone_57` (`phone`),
  UNIQUE KEY `phone_58` (`phone`),
  UNIQUE KEY `phone_59` (`phone`),
  UNIQUE KEY `phone_60` (`phone`),
  UNIQUE KEY `phone_61` (`phone`),
  UNIQUE KEY `phone_62` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_otps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(100) DEFAULT NULL,
  `otp` varchar(10) DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_passengers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `otp_verified` tinyint DEFAULT '0',
  `banned_until` timestamp NULL DEFAULT NULL,
  `is_blocked` tinyint DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_peak_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `surcharge_percentage` decimal(5,2) DEFAULT NULL,
  `is_active` tinyint DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_ride_gps_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `accuracy` decimal(8,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `speed` decimal(5,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `booking_id` (`booking_id`)
) ENGINE=InnoDB AUTO_INCREMENT=676 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_sos_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int DEFAULT NULL,
  `user_type` varchar(20) DEFAULT 'passenger',
  `user_id` int DEFAULT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `user_phone` varchar(20) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'active',
  `resolution_notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_special_location_charges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `place_type` varchar(100) NOT NULL,
  `display_name` varchar(150) NOT NULL,
  `surcharge_percentage` decimal(5,2) DEFAULT '0.00',
  `is_active` tinyint DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `place_type` (`place_type`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_surge_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `surge_key` varchar(50) DEFAULT NULL,
  `multiplier` decimal(3,2) DEFAULT '1.00',
  `is_active` tinyint DEFAULT '0',
  `description` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `surge_key` (`surge_key`)
) ENGINE=InnoDB AUTO_INCREMENT=103 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_tariffs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_type` varchar(50) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `config` json DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_vendor_tariffs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int DEFAULT NULL,
  `vehicle_type` varchar(50) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `config` json DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_vehicle_cat` (`vendor_id`,`vehicle_type`,`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_vendor_wallet_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `booking_id` int DEFAULT NULL,
  `driver_id` int DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('credit','debit') DEFAULT 'credit',
  `note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vendor_wallet_txn` (`vendor_id`),
  KEY `idx_booking_wallet_txn` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_vendor_wallets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `balance` decimal(12,2) DEFAULT '0.00',
  `total_earned` decimal(12,2) DEFAULT '0.00',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_id` (`vendor_id`),
  CONSTRAINT `taxi_vendor_wallets_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `taxi_vendors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `taxi_vendors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` varchar(50) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `business_name` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `is_blocked` tinyint DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vendor_id` (`vendor_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

