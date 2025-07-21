카페24 쇼핑몰 admin api를 활용한 특정 쇼핑몰 (단일 쇼핑몰: 소펙스코리아 sopexkorea.com) 상품 정보 조회 및 상품가격 수정 인터페이스 웹 개발

관리자만 정해진 id, pw로 로그인후 상품정보 조회/수정 웹으로 이동
데스크탑 전용 UI
엑셀 업로드, 테이블 정렬, 필터링, 검색 기능 포함
상품 가격 변동이 큰 만큼 관리자가 쉽고 간편하게 가격을 업데이트할 수 있는 게 주 목적

0. 사용자 가격 수정 플로우

1) 가격수정버튼 클릭시 편집 모드로 전환 (편집 모드는 제품별 공급가, 2차가격 1kg당 단가, 3차 가격 1kg당 단가 항목만 수정 가능)
2) 공급가 변경시 1kg 단가 자동 변경 
3) 2차가격 1kg당 단가 변경시 1kg단가에 더할 추가금액(additional) 자동 계산, 2차가격 토탈 금액 자동 표시
4) 3차가격 1kg당 단가 변경시 1kg단가에 더할 추가금액(additional) 자동 계산, 3차가격 토탈 금액 자동 표시
5) 가격저장 클릭시
- 공급가 변경: PUT /api/v2/admin/products/{product_no}로 상품별 변경처리
- 옵션명 수정: PUT /api/v2/admin/products/{product_no}/options 로 '1kg(공급가+원)' '5kg(2차토탈금액의 1kg단가+원)', '20kg(3차토탈금액의 1kg단가+원)' 변경 처리 
- 추가금액 수정: PUT /api/v2/admin/products/{product_no}/variants/{variant_code_5kg} 2차, 3차가격의 추가금액으로 변경 처리





1. 카페24 admin api: 상품정보 가져오기 요청 

[요청]
var request = require("request");
var options = { method: 'GET',
  url: 'https://{mallid}.cafe24api.com/api/v2/admin/products',
  headers: {
    'Authorization': "Bearer {access_token}",
    'Content-Type': "application/json",
    'X-Cafe24-Api-Version': "{version}"
  }
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
  
  console.log(body);
});

[응답]
{
    "products": [
        {
            "shop_no": 1,
            "product_no": 24,
            "product_code": "P000000X",
            "custom_product_code": "",
            "product_name": "iPhone X",
            "eng_product_name": "iPhone Ten",
            "supply_product_name": "iphone A1865 fdd lte",
            "internal_product_name": "Sample Internal product name",
            "model_name": "A1865",
            "price_excluding_tax": "1000.00",
            "price": "1100.00",
            "retail_price": "0.00",
            "supply_price": "9000.00",
            "display": "T",
            "selling": "F",
            "product_condition": "U",
            "product_used_month": 2,
            "summary_description": "This is Product Summary.",
            "margin_rate": "10.00",
            "tax_calculation": "M",
            "tax_type": "A",
            "tax_rate": 10,
            "price_content": null,
            "buy_limit_by_product": "T",
            "buy_limit_type": "F",
            "buy_group_list": [
                8,
                9
            ],
            "buy_member_id_list": [
                "sampleid",
                "testid"
            ],
            "repurchase_restriction": "F",
            "single_purchase_restriction": "F",
            "single_purchase": "F",
            "buy_unit_type": "O",
            "buy_unit": 1,
            "order_quantity_limit_type": "O",
            "minimum_quantity": 1,
            "maximum_quantity": 0,
            "points_by_product": "T",
            "points_setting_by_payment": "C",
            "points_amount": [
                {
                    "payment_method": "cash",
                    "points_rate": "0.00%"
                },
                {
                    "payment_method": "mileage",
                    "points_rate": "0.00%"
                }
            ],
            "except_member_points": "F",
            "product_volume": {
                "use_product_volume": "T",
                "product_width": "3cm",
                "product_height": "5.5cm",
                "product_length": "7cm"
            },
            "adult_certification": "F",
            "detail_image": "https://{domain}/web/product/big/201711/20_shop1_750339.png",
            "list_image": "https://{domain}/web/product/medium/201711/20_shop1_750339.png",
            "tiny_image": "https://{domain}/web/product/tiny/201711/20_shop1_750339.png",
            "small_image": "https://{domain}/web/product/small/201711/20_shop1_750339.png",
            "use_naverpay": "T",
            "naverpay_type": "C",
            "use_kakaopay": "T",
            "manufacturer_code": "M0000000",
            "trend_code": "T0000000",
            "brand_code": "B0000000",
            "supplier_code": "S0000000",
            "made_date": "",
            "release_date": "",
            "expiration_date": {
                "start_date": "2017-09-08",
                "end_date": "2017-09-14"
            },
            "origin_classification": "F",
            "origin_place_no": 1798,
            "origin_place_value": "",
            "made_in_code": "KR",
            "icon_show_period": {
                "start_date": "2017-10-30T09:00:00+09:00",
                "end_date": "2017-11-02T16:00:00+09:00"
            },
            "icon": [
                "icon_01_01",
                "icon_02_01"
            ],
            "hscode": "4303101990",
            "product_weight": "1.00",
            "product_material": "",
            "created_date": "2018-01-18T11:19:27+09:00",
            "updated_date": "2018-01-19T11:19:27+09:00",
            "english_product_material": null,
            "cloth_fabric": null,
            "list_icon": {
                "soldout_icon": true,
                "recommend_icon": false,
                "new_icon": false
            },
            "approve_status": "",
            "classification_code": "C000000A",
            "sold_out": "F",
            "additional_price": "0.00",
            "clearance_category_eng": "Necklaces",
            "clearance_category_kor": "주얼리 > 목걸이",
            "clearance_category_code": "ACAB0000",
            "exposure_limit_type": "M",
            "exposure_group_list": [
                8,
                9
            ],
            "set_product_type": null,
            "shipping_fee_by_product": "T",
            "shipping_fee_type": "W",
            "main": [
                3,
                2
            ],
            "market_sync": "F",
            "cultural_tax_deduction": "F",
            "size_guide": {
                "use": "T",
                "type": "default",
                "default": "Male"
            }
        },
        {
            "shop_no": 1,
            "product_no": 23,
            "product_code": "P000000W",
            "custom_product_code": "",
            "product_name": "iPhone X",
            "eng_product_name": "iPhone Ten",
            "supply_product_name": "iphone A1865 fdd lte",
            "internal_product_name": "Sample Internal product name",
            "model_name": "A1865",
            "price": 1000,
            "retail_price": 0,
            "supply_price": 0,
            "display": "T",
            "selling": "F",
            "product_condition": "U",
            "product_used_month": 2,
            "summary_description": "This is Product Summary.",
            "margin_rate": "10.00",
            "tax_calculation": "M",
            "tax_type": "A",
            "tax_rate": 10,
            "price_content": null,
            "buy_limit_by_product": "T",
            "buy_limit_type": "F",
            "buy_group_list": [
                8,
                9
            ],
            "buy_member_id_list": [
                "sampleid",
                "testid"
            ],
            "repurchase_restriction": "F",
            "single_purchase_restriction": "F",
            "single_purchase": "F",
            "buy_unit_type": "O",
            "buy_unit": 1,
            "order_quantity_limit_type": "O",
            "minimum_quantity": 1,
            "maximum_quantity": 0,
            "points_by_product": "T",
            "points_setting_by_payment": "C",
            "points_amount": [
                {
                    "payment_method": "cash",
                    "points_rate": "0.00%"
                },
                {
                    "payment_method": "mileage",
                    "points_rate": "0.00%"
                }
            ],
            "except_member_points": "F",
            "product_volume": {
                "use_product_volume": "T",
                "product_width": "3cm",
                "product_height": "5.5cm",
                "product_length": "7cm"
            },
            "adult_certification": "F",
            "detail_image": "https://{domain}/web/product/big/201711/20_shop1_750339.png",
            "list_image": "https://{domain}/web/product/medium/201711/20_shop1_750339.png",
            "tiny_image": "https://{domain}/web/product/tiny/201711/20_shop1_750339.png",
            "small_image": "https://{domain}/web/product/small/201711/20_shop1_750339.png",
            "use_naverpay": "T",
            "naverpay_type": "C",
            "use_kakaopay": "T",
            "manufacturer_code": "M0000000",
            "trend_code": "T0000000",
            "brand_code": "B0000000",
            "supplier_code": "S0000000",
            "made_date": "",
            "release_date": "",
            "expiration_date": {
                "start_date": "2017-09-08",
                "end_date": "2017-09-14"
            },
            "origin_classification": "F",
            "origin_place_no": 1798,
            "origin_place_value": "",
            "made_in_code": "KR",
            "icon_show_period": {
                "start_date": "2017-10-30T09:00:00+09:00",
                "end_date": "2017-11-02T16:00:00+09:00"
            },
            "icon": [
                "icon_01_01",
                "icon_02_01"
            ],
            "hscode": "4303101990",
            "product_weight": "1.00",
            "product_material": "",
            "created_date": "2018-01-18T11:19:27+09:00",
            "updated_date": "2018-01-19T11:19:27+09:00",
            "english_product_material": null,
            "cloth_fabric": null,
            "list_icon": {
                "soldout_icon": true,
                "recommend_icon": false,
                "new_icon": false
            },
            "approve_status": "C",
            "classification_code": "C000000A",
            "sold_out": "F",
            "additional_price": "0.00",
            "clearance_category_eng": null,
            "clearance_category_kor": null,
            "clearance_category_code": null,
            "exposure_limit_type": "M",
            "exposure_group_list": [
                8,
                9
            ],
            "set_product_type": null,
            "shipping_fee_by_product": "F",
            "shipping_fee_type": "T",
            "main": [
                3,
                2
            ],
            "market_sync": "F",
            "cultural_tax_deduction": "F",
            "size_guide": {
                "use": "T",
                "type": "default",
                "default": "Male"
            }
        }
    ]
}

2. 카페24 admin api: 상품정보 수정하기 

[요청]
var request = require("request");
var payload = {
    "shop_no": 1,
    "request": {
        "display": "T",
        "selling": "T",
        "product_condition": "U",
        "product_used_month": 2,
        "add_category_no": [
            {
                "category_no": 27,
                "recommend": "F",
                "new": "T"
            },
            {
                "category_no": 28,
                "recommend": "T",
                "new": "F"
            }
        ],
        "delete_category_no": [
            27,
            45
        ],
        "custom_product_code": "",
        "product_name": "iPhone X",
        "eng_product_name": "iPhone Ten",
        "supply_product_name": "iphone A1865 fdd lte",
        "internal_product_name": "Sample Internal product name",
        "model_name": "A1865",
        "price": "11000.00",
        "retail_price": "0.00",
        "supply_price": "9000.00",
        "soldout_message": "Sold out",
        "use_naverpay": "T",
        "naverpay_type": "C",
        "use_kakaopay": "T",
        "image_upload_type": "A",
        "detail_image": "/web/product/big/201511/30_shop1_638611.jpg",
        "manufacturer_code": "M0000000",
        "supplier_code": "S0000000",
        "brand_code": "B0000000",
        "trend_code": "T0000000",
        "product_weight": "1.00",
        "expiration_date": {
            "start_date": "2017-09-08",
            "end_date": "2017-09-14"
        },
        "icon": [
            "icon_01_01",
            "icon_02_01"
        ],
        "price_content": "Sample Content",
        "buy_limit_by_product": "T",
        "buy_limit_type": "F",
        "buy_group_list": [
            8,
            9
        ],
        "buy_member_id_list": [
            "sampleid",
            "testid"
        ],
        "repurchase_restriction": "F",
        "single_purchase_restriction": "F",
        "single_purchase": "F",
        "buy_unit_type": "O",
        "buy_unit": 1,
        "order_quantity_limit_type": "O",
        "minimum_quantity": 1,
        "maximum_quantity": 0,
        "points_by_product": "T",
        "points_setting_by_payment": "C",
        "points_amount": [
            {
                "payment_method": "cash",
                "points_rate": "100.00",
                "points_unit_by_payment": "W"
            },
            {
                "payment_method": "mileage",
                "points_rate": "10.00",
                "points_unit_by_payment": "P"
            }
        ],
        "except_member_points": "F",
        "product_volume": {
            "use_product_volume": "T",
            "product_width": 3,
            "product_height": 5.5,
            "product_length": 7
        },
        "description": "Sample Description.",
        "mobile_description": "Sample Mobile Description.",
        "summary_description": "This is Product Summary.",
        "simple_description": "This is Product Description.",
        "payment_info": "Sample payment info. You have to Pay.",
        "shipping_info": "Sample shipping info. You have to ship.",
        "exchange_info": "Sample exchange info. You have to exchange.",
        "service_info": "Sample service info. You have to service.",
        "hscode": "4303101990",
        "country_hscode": {
            "JPN": "430310011",
            "CHN": "43031020"
        },
        "relational_product": [
            {
                "product_no": 9,
                "interrelated": "T"
            },
            {
                "product_no": 10,
                "interrelated": "F"
            }
        ],
        "shipping_scope": "A",
        "shipping_fee_by_product": "T",
        "shipping_method": "01",
        "shipping_period": {
            "minimum": 4,
            "maximum": 10
        },
        "shipping_area": "All around world",
        "shipping_fee_type": "D",
        "shipping_rates": [
            {
                "shipping_rates_min": "2000.00",
                "shipping_rates_max": "4000.00",
                "shipping_fee": "5000.00"
            },
            {
                "shipping_rates_min": "4000.00",
                "shipping_rates_max": "6000.00",
                "shipping_fee": "2500.00"
            }
        ],
        "product_material": "Aluminum",
        "translate_product_material": "F",
        "english_product_material": "Aluminum",
        "cloth_fabric": "knit",
        "classification_code": "C000000A",
        "additional_price": "1100.00",
        "margin_rate": "10.00",
        "tax_type": "A",
        "tax_rate": 10,
        "prepaid_shipping_fee": "P",
        "clearance_category_code": "ACAB0000",
        "product_shipping_type": "D",
        "origin_classification": "F",
        "origin_place_no": 1798,
        "made_in_code": "KR",
        "translated_additional_description": "This is a translated additional description of product.",
        "additional_image": [
            "201810/a2803c44ee8299486ff19be239cef7d0.jpg",
            "201810/e1ab68969d69287a828438c7684b14c4.jpg"
        ],
        "additional_information": [
            {
                "key": "custom_option1",
                "value": "Additional Information 1"
            },
            {
                "key": "custom_option2",
                "value": "Additional Information 2"
            }
        ],
        "exposure_limit_type": "M",
        "exposure_group_list": [
            8,
            9
        ],
        "cultural_tax_deduction": "F",
        "size_guide": {
            "use": "T",
            "type": "default",
            "default": "Male"
        }
    }
};
var options = { method: 'PUT',
  url: 'https://{mallid}.cafe24api.com/api/v2/admin/products/7',
  headers: {
    'Authorization': "Bearer {access_token}",
    'Content-Type': "application/json",
    'X-Cafe24-Api-Version': "{version}"
  },
  body: payload,
  json: true
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
  
  console.log(body);
});

[응답]

{
    "product": {
        "shop_no": 1,
        "product_no": 7,
        "category": [
            {
                "category_no": 27,
                "recommend": "F",
                "new": "T"
            },
            {
                "category_no": 28,
                "recommend": "T",
                "new": "F"
            }
        ],
        "product_code": "P000000R",
        "custom_product_code": "",
        "product_name": "edu center product",
        "eng_product_name": "education center product",
        "internal_product_name": "Sample Internal product name",
        "model_name": "sample model",
        "price_excluding_tax": "10000.00",
        "price": "11000.00",
        "retail_price": "0.00",
        "supply_price": "9000.00",
        "soldout_message": "Sold out",
        "display": "T",
        "selling": "T",
        "product_condition": "U",
        "product_used_month": 2,
        "price_content": "Sample Content",
        "buy_limit_by_product": "T",
        "buy_limit_type": "F",
        "buy_group_list": [
            8,
            9
        ],
        "buy_member_id_list": [
            "sampleid",
            "testid"
        ],
        "repurchase_restriction": "F",
        "single_purchase_restriction": "F",
        "single_purchase": "F",
        "buy_unit_type": "O",
        "buy_unit": 1,
        "order_quantity_limit_type": "O",
        "minimum_quantity": 1,
        "maximum_quantity": 0,
        "points_by_product": "T",
        "points_setting_by_payment": "C",
        "points_amount": [
            {
                "payment_method": "cash",
                "points_rate": "100.00"
            },
            {
                "payment_method": "mileage",
                "points_rate": "10.00%"
            }
        ],
        "except_member_points": "F",
        "product_volume": {
            "use_product_volume": "T",
            "product_width": "3cm",
            "product_height": "5.5cm",
            "product_length": "7cm"
        },
        "adult_certification": "F",
        "description": "Sample Description.",
        "mobile_description": "Sample Mobile Description.",
        "payment_info": "Sample payment info. You have to Pay.",
        "shipping_info": "Sample shipping info. You have to ship.",
        "exchange_info": "Sample exchange info. You have to exchange.",
        "service_info": "Sample service info. You have to service.",
        "simple_description": "This is Product Description.",
        "summary_description": "This is Product Summary.",
        "use_naverpay": "T",
        "naverpay_type": "C",
        "use_kakaopay": "T",
        "manufacturer_code": "M0000000",
        "supplier_code": "S000000A",
        "brand_code": "B0000000",
        "trend_code": "T0000000",
        "product_weight": "1.00",
        "expiration_date": {
            "start_date": "2017-09-08",
            "end_date": "2017-09-14"
        },
        "icon": [
            "icon_01_01",
            "icon_02_01"
        ],
        "hscode": "4303101990",
        "country_hscode": {
            "JPN": "430310011",
            "CHN": "43031020"
        },
        "shipping_calculation": "M",
        "shipping_fee_by_product": "T",
        "shipping_method": "01",
        "shipping_period": {
            "minimum": 4,
            "maximum": 10
        },
        "shipping_scope": "A",
        "shipping_area": "All around world",
        "shipping_fee_type": "D",
        "shipping_rates": [
            {
                "shipping_rates_min": "2000.00",
                "shipping_rates_max": "4000.00",
                "shipping_fee": "5000.00"
            },
            {
                "shipping_rates_min": "4000.00",
                "shipping_rates_max": "6000.00",
                "shipping_fee": "2500.00"
            }
        ],
        "prepaid_shipping_fee": "P",
        "clearance_category_code": "ACAB0000",
        "product_shipping_type": "D",
        "image_upload_type": "A",
        "detail_image": "https://{domain}/web/product/big/201511/30_shop1_638611.jpg",
        "relational_product": [
            {
                "product_no": 9,
                "interrelated": "T"
            },
            {
                "product_no": 10,
                "interrelated": "F"
            }
        ],
        "product_material": "Aluminum",
        "english_product_material": "Aluminum",
        "cloth_fabric": "knit",
        "classification_code": "C000000A",
        "additional_price": "1100.00",
        "margin_rate": "10.00",
        "tax_calculation": "M",
        "tax_type": "A",
        "tax_rate": 10,
        "origin_classification": "F",
        "origin_place_no": 1798,
        "made_in_code": "KR",
        "updated_date": "2018-05-29T14:23:51+09:00",
        "translated_additional_description": "This is a translated additional description of product.",
        "additional_image": [
            {
                "big": "https://{domain}/web/product/extra/big/201810/a2803c44ee8299486ff19be239cef7d0.jpg",
                "medium": "https://{domain}/web/product/extra/medium/201810/a2803c44ee8299486ff19be239cef7d0.jpg",
                "small": "https://{domain}/web/product/extra/small/201810/a2803c44ee8299486ff19be239cef7d0.jpg"
            },
            {
                "big": "https://{domain}/web/product/extra/big/201810/e1ab68969d69287a828438c7684b14c4.jpg",
                "medium": "https://{domain}/web/product/extra/medium/201810/e1ab68969d69287a828438c7684b14c4.jpg",
                "small": "https://{domain}/web/product/extra/small/201810/e1ab68969d69287a828438c7684b14c4.jpg"
            }
        ],
        "additional_information": [
            {
                "key": "custom_option1",
                "name": "option1",
                "value": "Additional Information 1"
            },
            {
                "key": "custom_option2",
                "name": "option2",
                "value": "Additional Information 2"
            }
        ],
        "exposure_limit_type": "M",
        "exposure_group_list": [
            8,
            9
        ],
        "cultural_tax_deduction": "F",
        "size_guide": {
            "use": "T",
            "type": "default",
            "default": "Male"
        }
    }
}

3. 상품 옵션 수정하기

[요청]
var request = require("request");
var payload = {
    "shop_no": 1,
    "request": {
        "option_list_type": "S",
        "original_options": [
            {
                "option_name": "Color",
                "option_value": [
                    {
                        "option_text": "Black"
                    },
                    {
                        "option_text": "Red"
                    }
                ]
            },
            {
                "option_name": "Size",
                "option_value": [
                    {
                        "option_text": "Small"
                    },
                    {
                        "option_text": "Large"
                    }
                ]
            }
        ],
        "options": [
            {
                "option_name": "Color",
                "option_value": [
                    {
                        "option_image_file": "https://{domain}/web/upload/image_custom_615421761805558.gif",
                        "option_link_image": "/web/product/big/201604/1_shop1_423399.png",
                        "option_color": "#000000",
                        "option_text": "Black"
                    },
                    {
                        "option_image_file": "https://{domain}/web/upload/image_custom_615421761805551.gif",
                        "option_link_image": "/web/product/big/201604/1_shop1_436875.png",
                        "option_color": "#007543",
                        "option_text": "Red"
                    }
                ],
                "option_display_type": "P"
            },
            {
                "option_name": "Size",
                "option_value": [
                    {
                        "option_text": "Small"
                    },
                    {
                        "option_text": "Large"
                    }
                ],
                "option_display_type": "S"
            }
        ],
        "use_additional_option": "T",
        "additional_options": [
            {
                "additional_option_name": "Pattern",
                "required_additional_option": "T",
                "additional_option_text_length": 20
            },
            {
                "additional_option_name": "Custom Option",
                "required_additional_option": "F",
                "additional_option_text_length": 10
            }
        ],
        "use_attached_file_option": "T",
        "attached_file_option": {
            "option_name": "Pattern Images",
            "required": "T",
            "size_limit": 3
        }
    }
};
var options = { method: 'PUT',
  url: 'https://{mallid}.cafe24api.com/api/v2/admin/products/24/options',
  headers: {
    'Authorization': "Bearer {access_token}",
    'Content-Type': "application/json",
    'X-Cafe24-Api-Version': "{version}"
  },
  body: payload,
  json: true
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
  
  console.log(body);
});
[응답]
{
    "option": {
        "shop_no": 1,
        "product_no": 24,
        "has_option": "T",
        "option_type": "T",
        "option_list_type": "S",
        "option_preset_code": "",
        "options": [
            {
                "option_code": "",
                "option_name": "Color",
                "option_value": [
                    {
                        "option_image_file": "https://{domain}/web/product/option_button/201901/1b2fb6499d99b37581c79e10ad0b4d06.jpg",
                        "option_link_image": "https://{domain}/web/product/big/201604/1_shop1_423399.png",
                        "option_color": "#000000",
                        "option_text": "Black",
                        "value_no": null,
                        "additional_amount": null
                    },
                    {
                        "option_image_file": "https://{domain}/web/product/option_button/201901/7c5ge8616dc9b5j281c39dug740cjd28.jpg",
                        "option_link_image": "https://{domain}/web/product/big/201604/1_shop1_436875.png",
                        "option_color": "#007543",
                        "option_text": "Red",
                        "value_no": null,
                        "additional_amount": null
                    }
                ],
                "required_option": "T",
                "option_display_type": "P"
            },
            {
                "option_code": "",
                "option_name": "Size",
                "option_value": [
                    {
                        "option_image_file": "https://{domain}/web/product/option_button/201804/temp_shop1_931549.gif",
                        "option_link_image": "",
                        "option_color": "#000000",
                        "option_text": "Small",
                        "value_no": null,
                        "additional_amount": null
                    },
                    {
                        "option_image_file": "https://{domain}/web/product/option_button/201804/temp_shop1_931549.gif",
                        "option_link_image": "",
                        "option_color": "#007543",
                        "option_text": "Large",
                        "value_no": null,
                        "additional_amount": null
                    }
                ],
                "required_option": "T",
                "option_display_type": "S"
            }
        ],
        "use_additional_option": "T",
        "additional_options": [
            {
                "additional_option_name": "Pattern",
                "required_additional_option": "T",
                "additional_option_text_length": 20
            },
            {
                "additional_option_name": "Custom Option",
                "required_additional_option": "F",
                "additional_option_text_length": 10
            }
        ],
        "use_attached_file_option": "T",
        "attached_file_option": {
            "option_name": "Pattern Images",
            "required": "T",
            "size_limit": 3
        }
    }
}

4. 상품 variant 수정하기
[요청]
var request = require("request");
var payload = {
    "shop_no": 1,
    "request": {
        "custom_variant_code": "OPTION_CUSTOM_CODE",
        "display": "T",
        "selling": "F",
        "additional_amount": "-1000.00",
        "quantity": 15,
        "use_inventory": "T",
        "important_inventory": "A",
        "inventory_control_type": "B",
        "display_soldout": "T",
        "safety_inventory": 10
    }
};
var options = { method: 'PUT',
  url: 'https://{mallid}.cafe24api.com/api/v2/admin/products/16/variants/P000000P000A',
  headers: {
    'Authorization': "Bearer {access_token}",
    'Content-Type': "application/json",
    'X-Cafe24-Api-Version': "{version}"
  },
  body: payload,
  json: true
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
  
  console.log(body);
});

[응답]
{
    "variant": {
        "shop_no": 1,
        "variant_code": "P000000R000A",
        "options": [
            {
                "name": "Color",
                "value": "Black"
            },
            {
                "name": "Size",
                "value": "L"
            }
        ],
        "custom_variant_code": "OPTION_CUSTOM_CODE",
        "duplicated_custom_variant_code": "F",
        "display": "T",
        "selling": "F",
        "additional_amount": "-1000.00",
        "inventories": {
            "shop_no": 1,
            "variant_code": "P000000R000A",
            "quantity": 15,
            "use_inventory": "T",
            "important_inventory": "A",
            "inventory_control_type": "B",
            "display_soldout": "T",
            "safety_inventory": 10
        }
    }
}


5. 카페24 api 최신버전: 2025-06-01

6. Get Authentication Code
GET 'https://{mallid}.cafe24api.com/api/v2/oauth/authorize?response_type=code&client_id={client_id}&state={state}&redirect_uri={redirect_uri}&scope={scope}'

5. Get Access Token 
var request = require("request");
var payload = grant_type=authorization_code&code={code}&redirect_uri={redirect_uri};
var options = { method: 'POST',
  url: 'https://{mallid}.cafe24api.com/api/v2/oauth/token',
  headers: {
    'Authorization': "Basic {base64_encode({client_id}:{client_secret})}",
    'Content-Type': "application/x-www-form-urlencoded"
  },
  body: payload,
  json: true
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
  
  console.log(body);
});

