/* eslint-disable @typescript-eslint/no-explicit-any */
// Auto-generated fallback prediction for all 40 models
export const fallbackPrediction = {
  "api_version": "v1",
  "contract_version": "model-inference-v1",
  "catalog_version": "3ea1ea395518c6eda8872129a41cd9f19bd43fbb82e83937871ca28a15fe8795",
  "request_id": "7635387c-2260-412c-9225-3fdc34f9e4ca",
  "status": "success",
  "location": {
    "sample_id": "mm_1837_425__2025-07",
    "grid_id": "mm_1837_425",
    "region": "ayeyawaddy",
    "observation_month": "2025-07",
    "requested_lat": 16.9211,
    "requested_lon": 95.2341,
    "matched_lat": 16.915029946467964,
    "matched_lon": 95.22079176551776,
    "distance_km": 1.5684
  },
  "predictions": {
    "crop_suitability_monsoon_rice": {
      "value": "excellent",
      "label": "excellent",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9944616288360082,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "excellent": 0.9944616288360082,
        "good": 0.005527066328287545,
        "moderate": 0.000011304835703393369
      },
      "model_version": "sha256-43634acd4be7",
      "artifact_sha256": "43634acd4be7825ea8d252e69eae861ec46dcf7062ccfc6a315ec139e52ab31d",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_dry_season_rice": {
      "value": "excellent",
      "label": "excellent",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9982086675953478,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "excellent": 0.9982086675953478,
        "good": 0.0017716099557363472,
        "moderate": 0.000019722448915629152
      },
      "model_version": "sha256-c6945e4af633",
      "artifact_sha256": "c6945e4af63316ac4a86f3890f113b8fdc088efbcbfb389ee87e366d649c3820",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_maize": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.8554023337514868,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.8554023337514868,
        "moderate": 0.14459766624851336
      },
      "model_version": "sha256-8e16af4ad619",
      "artifact_sha256": "8e16af4ad619a340b11f8279fd1cf557adf05bb3ab5cd22fef6b19b042c2fa70",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor', 'excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_sugarcane": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9678560542974743,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.9678560542974743,
        "moderate": 0.03214394570252578
      },
      "model_version": "sha256-c693e138bb44",
      "artifact_sha256": "c693e138bb4486911805dfd5ae789bb7bb270d973b8402ad55032326e2982616",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor', 'excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_cassava": {
      "value": "moderate",
      "label": "moderate",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9969176081813653,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.003082391818634179,
        "moderate": 0.9969176081813653,
        "poor": 0
      },
      "model_version": "sha256-aef51231bc36",
      "artifact_sha256": "aef51231bc36c06c508e69df6734f1dc8d3e7afbc2cc6721c3010374e94cbd73",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_durian": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.7977435816577648,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.7977435816577648,
        "moderate": 0.20225641834223507,
        "poor": 0
      },
      "model_version": "sha256-218fcdc27453",
      "artifact_sha256": "218fcdc27453829a1e910e0beb665f9e9dc04601266a9dfdfa07fd647667e0a5",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_mangosteen": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.8008007008901378,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.8008007008901378,
        "moderate": 0.19919929910986287,
        "poor": 0
      },
      "model_version": "sha256-932409683545",
      "artifact_sha256": "9324096835454aa263ce5acc80bac93d12bace81351afe3c925ae3249c43d676",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_longan": {
      "value": "moderate",
      "label": "moderate",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9996115050484685,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.0003884949515314796,
        "moderate": 0.9996115050484685,
        "poor": 0
      },
      "model_version": "sha256-0871cc313da5",
      "artifact_sha256": "0871cc313da59c6438c0fae4be30d18cf1fdf11d54f5f4b2e53b5c383e3edd82",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_mango": {
      "value": "moderate",
      "label": "moderate",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.989433291721763,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.010566708278236338,
        "moderate": 0.989433291721763,
        "poor": 0
      },
      "model_version": "sha256-7cd4fc44f88a",
      "artifact_sha256": "7cd4fc44f88ab7be4de6df7af365e68e122e025c5809f41a0954daf44281e170",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_chili": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9920160048655924,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.9920160048655924,
        "moderate": 0.00798399513440761
      },
      "model_version": "sha256-fffac11a3bbe",
      "artifact_sha256": "fffac11a3bbec22ecd4f5a03de951f8df02600b46733e98344146b91a4c8deab",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor', 'excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_tomato": {
      "value": "moderate",
      "label": "moderate",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.7970615438158198,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0,
        "moderate": 0.7970615438158198,
        "poor": 0.20293845618418016
      },
      "model_version": "sha256-2caf4eaa5bba",
      "artifact_sha256": "2caf4eaa5bba0fe2d471ff840c652917d473ff744799886016bf0c22bb867b60",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_black_gram": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9910148111198371,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.9910148111198371,
        "moderate": 0.008985188880162712
      },
      "model_version": "sha256-c299ea57f47b",
      "artifact_sha256": "c299ea57f47be7e1824755e443c3a1088160f15a47e5f2b89b79ca6aafc4d62d",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor', 'excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_green_gram": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9858081054579481,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.9858081054579481,
        "moderate": 0.014191894542051959
      },
      "model_version": "sha256-eb9a8c6cc783",
      "artifact_sha256": "eb9a8c6cc783f491d4126d33bfc277a8bbf4d2a72cd9655cdd0d81808053e69e",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor', 'excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_pigeon_pea": {
      "value": "moderate",
      "label": "moderate",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.8922127390061975,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.10778726099380248,
        "moderate": 0.8922127390061975,
        "poor": 0
      },
      "model_version": "sha256-dab2759945b7",
      "artifact_sha256": "dab2759945b7994d9fbec131be33b0be19496fbcad4bc392866dbb6ba90ed612",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_groundnut": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9934717412038582,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.9934717412038582,
        "moderate": 0.00652825879614154
      },
      "model_version": "sha256-fbe3498eb44c",
      "artifact_sha256": "fbe3498eb44c060c1bd7ca089bda8c68c9351365eda3613b55b4cea967b67bb3",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor', 'excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_sesame": {
      "value": "moderate",
      "label": "moderate",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.8328893444347957,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.16711065556520407,
        "moderate": 0.8328893444347957,
        "poor": 0
      },
      "model_version": "sha256-6ca045e4909e",
      "artifact_sha256": "6ca045e4909ef4e88842773c7ea123696d863004f0892df312c76b4eca16221f",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_suitability_rubber": {
      "value": "good",
      "label": "good",
      "unit": "suitability_class",
      "task_type": "classification",
      "confidence": 0.9958156612215223,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "good": 0.9958156612215223,
        "moderate": 0.004184338778477995
      },
      "model_version": "sha256-50c6822fc8c0",
      "artifact_sha256": "50c6822fc8c0ffa454589970fd837f38e84bb1ba321d0df339c00e9759b0f6f7",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: ['poor', 'excellent'].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_health_score": {
      "value": 0.6647166732360642,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-3a102e074fa7",
      "artifact_sha256": "3a102e074fa731a1098b9d975afafc6d738947354a38a62351114e1f9356f7b0",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "crop_yield_t_ha": {
      "value": 2.917399300069124,
      "label": null,
      "unit": "tonnes_per_hectare",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-2e15414c5b1b",
      "artifact_sha256": "2e15414c5b1bd7476168055ef2a41215881404abaa7c759ad3be53ad2daa2535",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "irrigation_need": {
      "value": 2,
      "label": "2",
      "unit": "class_0_to_2",
      "task_type": "classification",
      "confidence": 0.9884527912424461,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "1": 0.01154720875755383,
        "2": 0.9884527912424461
      },
      "model_version": "sha256-c49708aeef71",
      "artifact_sha256": "c49708aeef7154020057b0ef5498c26c5c7e22de76959c47435bdf1b44f3ea71",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: [0].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "current_month_precipitation_mm": {
      "value": 424.9319918443419,
      "label": null,
      "unit": "millimetres",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-2d82ce3fc909",
      "artifact_sha256": "2d82ce3fc909084d654ad2ec5352298216f0ab2db6822dd6bce90c3156e5ab5a",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "TARGET LEAKAGE SUSPECTED: Features near-identically correlated with target: chirps_precipitation_mm (r=0.9995) | HIGH OUTLIER ERRORS: 130 test predictions (2.17%) have errors > 3x RMSE; HETEROSCEDASTICITY DETECTED: Residual magnitude correlates with predicted scale (r=0.5604)",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "current_month_mean_temperature_c": {
      "value": 26.558809998445167,
      "label": null,
      "unit": "degrees_celsius",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-1275b950ef9c",
      "artifact_sha256": "1275b950ef9c20287bd58a73810eec0c37f3433511176cea43df6d5c64ba656d",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 87 test predictions (1.45%) have errors > 3x RMSE",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "current_month_solar_rad_mj_m2_day": {
      "value": 11.776983507094931,
      "label": null,
      "unit": "megajoules_per_square_metre_per_day",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-0f637097ccfe",
      "artifact_sha256": "0f637097ccfe28bd8720399f317b11322a46b7d6c19ba5edff6435aec15d8278",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 82 test predictions (1.37%) have errors > 3x RMSE",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "flood_risk_level": {
      "value": 1,
      "label": "1",
      "unit": "class_0_to_2",
      "task_type": "classification",
      "confidence": 0.9670007653026819,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "0": 0.00011775702062551866,
        "1": 0.9670007653026819,
        "2": 0.032881477676692784
      },
      "model_version": "sha256-f7cdce1da903",
      "artifact_sha256": "f7cdce1da903a8ec3d51557447925076864b0e4878ffdee8e8ed2167668bb2c6",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "drought_risk_score": {
      "value": 0.5461453320860372,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-8e31a31d354b",
      "artifact_sha256": "8e31a31d354b8b7f853db3a95c36624253b5169790c7401cf26d96284add12fe",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "heat_stress_risk": {
      "value": 0,
      "label": "0",
      "unit": "class_0_to_2",
      "task_type": "classification",
      "confidence": 1,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "0": 1,
        "1": 0
      },
      "model_version": "sha256-f3b37417bddd",
      "artifact_sha256": "f3b37417bddd518e2e04f86f7505d4a90008170c44af4d9d5ee24c99df6cc11b",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: [2].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "optimal_planting_month": {
      "value": 5,
      "label": "5",
      "unit": "month_1_to_12",
      "task_type": "classification",
      "confidence": 1,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "5": 1,
        "6": 0
      },
      "model_version": "sha256-ff295de0c410",
      "artifact_sha256": "ff295de0c4108bf31593c085d369aac589c348c9513b22b0a3942b0e61fcf035",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "Training artifact contains no examples for expected classes: [1, 2, 3, 4, 7, 8, 9, 10, 11, 12].",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "nitrogen_requirement_level": {
      "value": 1,
      "label": "1",
      "unit": "class_0_to_2",
      "task_type": "classification",
      "confidence": 0.9972187831835069,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "0": 0.0015503614577212896,
        "1": 0.9972187831835069,
        "2": 0.0012308553587717281
      },
      "model_version": "sha256-e9723d0a334b",
      "artifact_sha256": "e9723d0a334bebdf59bd07df07953466d58b6b90829d61d9c4746f9dcd033d1d",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "phosphorus_requirement_level": {
      "value": 0,
      "label": "0",
      "unit": "class_0_to_2",
      "task_type": "classification",
      "confidence": 0.9936827127112104,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "0": 0.9936827127112104,
        "1": 0.006317287288789512,
        "2": 0
      },
      "model_version": "sha256-afaaf0fba029",
      "artifact_sha256": "afaaf0fba0298e3c71149a12cee43aa927a650155dd77dc42d5e6f456cca6f30",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "soil_erosion_risk": {
      "value": 1,
      "label": "1",
      "unit": "class_0_to_2",
      "task_type": "classification",
      "confidence": 1,
      "confidence_kind": "random_forest_vote_share_uncalibrated",
      "probabilities": {
        "0": 0,
        "1": 1,
        "2": 0
      },
      "model_version": "sha256-b5a2a1c3fdaf",
      "artifact_sha256": "b5a2a1c3fdaff06aa97465e89f001b696407263393b3eaf1a45dd75e3fa95d3a",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "market_integration_score": {
      "value": 0.6719213869059661,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-34436df87168",
      "artifact_sha256": "34436df87168c765d62bf82e6e6b67ae10ac8ae175f2fbcca50f7458d6e17887",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "post_harvest_loss_risk": {
      "value": 0.380797979864158,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-25ba95182670",
      "artifact_sha256": "25ba95182670328a759912cf898416e45c0f4d3864edc9cbb3a0d032f250ac69",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "supply_chain_efficiency": {
      "value": 0.5773432453385815,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-707d82088e70",
      "artifact_sha256": "707d82088e70330e4b6407ff0a0472f5b62da09d8b539e81326654cad1fecd52",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 62 test predictions (1.03%) have errors > 3x RMSE",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "cold_chain_potential": {
      "value": 0.12027535884734344,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-f1b9c6134e91",
      "artifact_sha256": "f1b9c6134e919e4705459f989dd40e87ee78b9b2958e767709108db0221e50c1",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 111 test predictions (1.85%) have errors > 3x RMSE",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "agricultural_land_conversion_risk": {
      "value": 0.11244032485940453,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-b3327ecb8f49",
      "artifact_sha256": "b3327ecb8f494dc351e3a11216dcf148d7bded5421576b8619b05918bf548c3c",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 137 test predictions (2.28%) have errors > 3x RMSE; HETEROSCEDASTICITY DETECTED: Residual magnitude correlates with predicted scale (r=0.5430)",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "urban_encroachment_risk": {
      "value": 0.26528987704186513,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-09dcee3a405e",
      "artifact_sha256": "09dcee3a405e40f34753b04382293f084f74c7650fff9ff819f567e43c505129",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 62 test predictions (1.03%) have errors > 3x RMSE",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "irrigation_potential": {
      "value": 0.5592088193932232,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-6f7c4f300ad5",
      "artifact_sha256": "6f7c4f300ad5991505363b3d43f7d1843c65aec30e78017dbde54515fb82791f",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "surface_water_occurrence": {
      "value": 0.1681609525894661,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-79fa9e7854e4",
      "artifact_sha256": "79fa9e7854e4501f23e35922bb2b88799eb34303dfc0cac9d1c357968ebaa00a",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 77 test predictions (1.28%) have errors > 3x RMSE",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "water_scarcity_risk": {
      "value": 0.20049377903924076,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-08ad3e64b2c0",
      "artifact_sha256": "08ad3e64b2c079064e65c580955e88a2e8d5d057de8a5740ad4974c3d10f1965",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "flagged",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "HIGH OUTLIER ERRORS: 99 test predictions (1.65%) have errors > 3x RMSE",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    },
    "agricultural_gdp_forecast": {
      "value": 0.6232027213847053,
      "label": null,
      "unit": "score_0_to_1",
      "task_type": "regression",
      "confidence": null,
      "confidence_kind": null,
      "probabilities": null,
      "model_version": "sha256-e9b40183104e",
      "artifact_sha256": "e9b40183104e5a6010dd3a5714508531500cfd1d77fef47cfcd7e6fbe4a2dd30",
      "input_schema_sha256": "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8",
      "model_source": "primary",
      "deployment_status": "experimental",
      "validation_status": "healthy",
      "warnings": [
        "Experimental surrogate model trained on rule-engineered labels; not field-validated.",
        "The serving row contains 1 missing feature value(s); the released estimator's native missing-value handling was used."
      ]
    }
  },
  "composite_features": {
    "crop_recommender": {
      "status": "experimental",
      "strict_ranking_available": false,
      "reason_code": "CROSS_MODEL_CALIBRATION_REQUIRED",
      "recommendation_basis": "shared suitability tier only; crops inside a tier are intentionally tied",
      "top_suitability_tier": "excellent",
      "top_recommendations": [
        {
          "crop": "dry_season_rice",
          "suitability": "excellent",
          "tree_vote_agreement": 0.9982086675953478,
          "color_code": "#10B981"
        },
        {
          "crop": "monsoon_rice",
          "suitability": "excellent",
          "tree_vote_agreement": 0.9944616288360082,
          "color_code": "#10B981"
        }
      ],
      "suitability_tiers": {
        "excellent": [
          {
            "crop": "dry_season_rice",
            "suitability": "excellent",
            "tree_vote_agreement": 0.9982086675953478,
            "color_code": "#10B981"
          },
          {
            "crop": "monsoon_rice",
            "suitability": "excellent",
            "tree_vote_agreement": 0.9944616288360082,
            "color_code": "#10B981"
          }
        ],
        "good": [
          {
            "crop": "black_gram",
            "suitability": "good",
            "tree_vote_agreement": 0.9910148111198371,
            "color_code": "#3B82F6"
          },
          {
            "crop": "chili",
            "suitability": "good",
            "tree_vote_agreement": 0.9920160048655924,
            "color_code": "#3B82F6"
          },
          {
            "crop": "durian",
            "suitability": "good",
            "tree_vote_agreement": 0.7977435816577648,
            "color_code": "#3B82F6"
          },
          {
            "crop": "green_gram",
            "suitability": "good",
            "tree_vote_agreement": 0.9858081054579481,
            "color_code": "#3B82F6"
          },
          {
            "crop": "groundnut",
            "suitability": "good",
            "tree_vote_agreement": 0.9934717412038582,
            "color_code": "#3B82F6"
          },
          {
            "crop": "maize",
            "suitability": "good",
            "tree_vote_agreement": 0.8554023337514868,
            "color_code": "#3B82F6"
          },
          {
            "crop": "mangosteen",
            "suitability": "good",
            "tree_vote_agreement": 0.8008007008901378,
            "color_code": "#3B82F6"
          },
          {
            "crop": "rubber",
            "suitability": "good",
            "tree_vote_agreement": 0.9958156612215223,
            "color_code": "#3B82F6"
          },
          {
            "crop": "sugarcane",
            "suitability": "good",
            "tree_vote_agreement": 0.9678560542974743,
            "color_code": "#3B82F6"
          }
        ],
        "moderate": [
          {
            "crop": "cassava",
            "suitability": "moderate",
            "tree_vote_agreement": 0.9969176081813653,
            "color_code": "#F59E0B"
          },
          {
            "crop": "longan",
            "suitability": "moderate",
            "tree_vote_agreement": 0.9996115050484685,
            "color_code": "#F59E0B"
          },
          {
            "crop": "mango",
            "suitability": "moderate",
            "tree_vote_agreement": 0.989433291721763,
            "color_code": "#F59E0B"
          },
          {
            "crop": "pigeon_pea",
            "suitability": "moderate",
            "tree_vote_agreement": 0.8922127390061975,
            "color_code": "#F59E0B"
          },
          {
            "crop": "sesame",
            "suitability": "moderate",
            "tree_vote_agreement": 0.8328893444347957,
            "color_code": "#F59E0B"
          },
          {
            "crop": "tomato",
            "suitability": "moderate",
            "tree_vote_agreement": 0.7970615438158198,
            "color_code": "#F59E0B"
          }
        ],
        "poor": []
      },
      "probability_calibrated": false,
      "field_validated": false
    },
    "crop_health": {
      "status": "experimental",
      "health_score": 0.6647166732360642,
      "health_class": "Good",
      "ndvi_median": 0.4003363251686096,
      "map_color_hex": "#3B82F6",
      "field_validated": false
    },
    "economic_roi": {
      "status": "unavailable",
      "reason_code": "VERIFIED_ECONOMIC_INPUTS_REQUIRED",
      "message": "ROI is withheld until verified crop price, input cost and currency-period data are supplied."
    },
    "risk_alerts": {
      "status": "experimental",
      "overall_level": "medium",
      "risk_scores": {
        "flood": 0.5,
        "drought": 0.5461453320860372,
        "heat": 0,
        "erosion": 0.5,
        "water_scarcity": 0.20049377903924076
      },
      "advisory_status": "human_review_required",
      "approved_action": null,
      "field_validated": false
    },
    "land_use": {
      "status": "experimental",
      "risk_level": "low",
      "conversion_risk_score": 0.11244032485940453,
      "urban_encroachment_score": 0.26528987704186513,
      "cropland_fraction": 0.8151533603668213,
      "field_validated": false
    }
  },
  "provenance": {
    "feature_dataset_sha256": "375f4280ccbb2534268877734805bf113f85517e39994f053ffa5f57c19f6643",
    "spatial_index_sha256": "045ddb5d1e7d7c4b168ba9d35380bf03121d9230ba62a6d34f9bd37d41518ddc",
    "data_source": "ERA5, CHIRPS, SoilGrids, OpenStreetMap, ESA WorldCover v200, JRC GSW1_4, WorldPop",
    "source_date": "2024-07",
    "source_version": "v1.1",
    "quality_flag": 1,
    "label_source": "rule_engineered_surrogate",
    "field_validated": false
  },
  "execution_metadata": {
    "response_time_ms": 5725.89,
    "queue_wait_ms": 0.02,
    "cached": false,
    "models_loaded_count": 2
  }
} as any;
