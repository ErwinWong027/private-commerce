# -*- coding: utf-8 -*-
"""
聊天记录结构化脚本
- 解析 context/chat_text.txt（自 聊天记录.pdf 提取的纯文本），按会话/消息结构化
- 将 PDF 中嵌入的图片（context/imgs/）与 spec.png 引入 JSON，并按
  「序号_发言人_日期时间_含义」重命名
- 输出 context/聊天记录.json

用法：python3 私域电商售前客服AI规划/scripts/build_chat_records.py
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "context"
IMG_DIR = ROOT / "imgs"
SRC_TXT = ROOT / "chat_text.txt"
OUT_JSON = ROOT / "聊天记录.json"
SPEC_SRC = ROOT / "spec.png"          # 与 规格.png 内容相同；两份原件均保留，另拷贝一份入 imgs/ 供 JSON 引用
SPEC_DUP = ROOT / "规格.png"
SPEC_DST = IMG_DIR / "00_全规格价格表_客服物料_2026-06.png"

AGENT = "替替（正品）"   # 客服主账号
AGENT2 = "泡泡"          # 客服账号（第15-19位客户）

# ---------------------------------------------------------------------------
# 图片登记表
# id: 顺序编号; old: 原文件名(pXXX=PDF页码); speaker/time: 依据 PDF 上下文判定
# ---------------------------------------------------------------------------
IMAGES = [
    dict(id=1,  old="p002_x20_635x626.png",  session="S01", speaker=AGENT, time="6/20 17:06:15",
         meaning="报价表",
         desc="三版本全规格报价表：孟版杰西卡(一盒一支)2.5mg230/5.0mg270/7.5mg300/10mg340/12.5mg370/15mg400；"
              "日版礼来(一盒两支)2.5mg498/5.0mg698/7.5mg998/10mg1190/12.5mg1590/15mg缺货；"
              "珠峰(一盒一支)2.5mg240/5.0mg300/7.5mg330/10mg360。注明：不包邮顺丰冷链到付、时效2-3天、"
              "冷链运输泡沫箱+保温袋+冰袋、扫码验真三码合一、一针一星期、只卖正品。",
         ocr="孟版杰西卡(一盒一支) 2.5→230 5.0→270 7.5→300 10→340 12.5→370 15→400 | "
             "日版礼来(一盒两支) 2.5→498 5.0→698 7.5→998 10→1190 12.5→1590 15→暂时缺货 | "
             "珠峰(一盒一支) 2.5→240 5.0→300 7.5→330 10→360 | "
             "不包邮顺丰冷链到付快递时效2-3天；冷链运输:泡沫箱+保温袋+冰袋；"
             "扫码验真官网查验三码合一保真保活；以上所有版本都是一针一个星期；"
             "只卖正品官网唯一网址诚信不做一锤子买卖；咱家不卖仿版不卖假药不要拿B货低价比"),
    dict(id=2,  old="p004_x27_1080x1440.png", session="S01", speaker=AGENT, time="6/20 17:51:19",
         meaning="收款码",
         desc="星驿付聚合收款码（商户名'摆个毛线摊'），支持云闪付/微信/支付宝/银联/银行APP，"
              "用于回答客户'怎么付款，直接转账吗'。",
         ocr="星驿付 让支付更有价值 | 欢迎扫码付款 | 商户：摆个毛线摊 | "
             "请您在付款前确认商户信息无误，妥善保管支付密码 | 全国统一服务热线 4000 696 333"),
    dict(id=3,  old="p006_x32_1320x2120.png", session="S01", speaker="nuri", time="6/20 19:31:34",
         meaning="付款截图",
         desc="客户付款成功页：微信支付 ¥1120.00（孟版7.5×4盒，1200-80优惠），商户'摆个毛线摊'。",
         ocr="支付成功 | 摆个毛线摊 | ¥1120.00"),
    dict(id=4,  old="p008_x37_1152x2048.png", session="S01", speaker=AGENT, time="6/20 20:00:11",
         meaning="顺丰运单",
         desc="顺丰速运运单照片，运单号 SF1577518814895，客户 nuri 订单的发货单号。",
         ocr="顺丰速运 SF EXPRESS | 运单号 SF1577518814895 | 95338 www.sf-express.com"),
    dict(id=5,  old="p010_x44_635x626.png",  session="S02", speaker=AGENT, time="6/18 16:30:37",
         meaning="报价表", desc="三版本全规格报价表（同图1），回答客户'蒙版5.0多少'。",
         ocr="同图1：孟版杰西卡/日版礼来/珠峰 全规格价格表"),
    dict(id=6,  old="p014_x53_3072x4096.png", session="S02", speaker=AGENT, time="6/18 17:07:05",
         meaning="收款码",
         desc="星驿付聚合收款码（商户'摆个毛线摊'），报价'7.5一盒300优惠后280'后发给客户付款。",
         ocr="星驿付 | 欢迎扫码付款 | 商户：摆个毛线摊"),
    dict(id=7,  old="p016_x58_1080x2336.png", session="S02", speaker="余生", time="6/18 17:07:46",
         meaning="付款截图",
         desc="客户缴费详情页：微信支付 ¥280，交易时间 2026-06-18 17:07:19，订单号 82026061817071882196。",
         ocr="缴费详情 | 订单编号 82026061817071882196 | 交易时间 2026-06-18 17:07:19 | "
             "支付成功 微信 已完成 | 金额 ¥280"),
    dict(id=8,  old="p019_x65_900x1600.png", session="S02", speaker=AGENT, time="6/18 19:52:33",
         meaning="顺丰运单",
         desc="顺丰速运运单照片，运单号 SF1577518773992，客户余生订单的发货单号。",
         ocr="顺丰速运 | 运单号 SF1577518773992"),
    dict(id=9,  old="p021_x70_3024x4032.png", session="S03", speaker="佛系", time="6/18 10:25:40",
         meaning="客户药品实拍",
         desc="客户发来自用药品实拍：竹席上的 Tizaro 药盒（白紫包装）+预灌封注射针剂+说明书+剪刀，"
              "配文'你那里有日版的吗'。",
         ocr="TJARO 药盒 + 预灌封注射笔 + 黑色剪刀，置于竹席上"),
    dict(id=10, old="p022_x73_3024x4032.png", session="S03", speaker="佛系", time="6/18 10:25:42",
         meaning="客户药品实拍",
         desc="客户手持 Tizaro 2.5 药盒特写（Tirzepatide INJ 2.5mg/0.5ml，ZISKA PHARMA，孟版），"
              "配文'用过这二个对我没用4.6号用的'，客服据此判断'你发的这个是孟版哦'。",
         ocr="Tizaro 2.5 | Tirzepatide INJ 2.5 mg | Subcutaneous Injection Once Weekly | "
             "2.5 mg/0.5 ml 1 pre-filled syringe | ZISKA PHARMA"),
    dict(id=11, old="p084_x220_635x626.png", session="S03", speaker=AGENT, time="6/18 10:26:29",
         meaning="报价表",
         desc="三版本全规格报价表（同图1），配文'这是价格表你看看'。原件从 PDF 第84页（佛系重复导出段落）提取，"
              "内容与 S03 原段落 10:26:29 发送的报价图为同一素材。",
         ocr="同图1：孟版杰西卡/日版礼来/珠峰 全规格价格表"),
    dict(id=12, old="p043_x127_1184x341.png", session="S04", speaker=AGENT, time="6/17 10:35:00",
         meaning="版本对比图",
         desc="三版本星级对比图：日版礼来(原研) vs 孟版杰西卡(Ziska) vs 孟版珠峰(Everest)，"
              "从效果上限、纯度/稳定性、过敏风险、副作用可控性、价格、推荐人群六个维度星级评分，"
              "配文'这是对比图'。",
         ocr="效果上限:日版最强最稳/孟版杰西卡前期掉秤快/珠峰温和版 | 纯度稳定性:日版几乎无杂质 | "
             "价格:珠峰最便宜性价比高 | 推荐人群:日版敏感体质长期用；杰西卡预算有限短期冲量；珠峰预算紧怕强反应"),
    dict(id=13, old="p045_x132_1280x2781.png", session="S04", speaker=AGENT, time="6/17 10:35:17",
         meaning="日版实拍",
         desc="日版礼来曼珠罗(Mounjaro)全规格药盒实拍：2.5/5/7.5/10/12.5/15mg，GIP/GLP-1 週1回投与，Lilly，"
              "配文'日版是最好的'。",
         ocr="マンジャロ®(Mounjaro) Lilly | 2.5mg/5mg/7.5mg/10mg/12.5mg/15mg | GIP/GLP-1 週1回投与"),
    dict(id=14, old="p047_x137_1280x2781.png", session="S04", speaker=AGENT, time="6/17 10:35:20",
         meaning="孟版实拍",
         desc="孟版 Ziska Tizaro 全规格药盒实拍：2.5~15mg 六盒排列，预灌封注射剂，配文'过来是孟版杰西卡'。",
         ocr="Tizaro (ZISKA PHARMA) | Tirzepatide INJ 2.5/5/7.5/10/12.5/15 mg | 0.5 mL 预灌封注射剂"),
    dict(id=15, old="p030_x92_1290x2796.png", session="S03", speaker="佛系", time="6/18 11:27:52",
         meaning="付款截图",
         desc="客户微信支付成功页：¥300.00（孟版7.5原价，618优惠20由客服扫码另行返还）。",
         ocr="微信支付 已支付 ¥300.00 | 摆个毛线摊 | 11:27"),
    dict(id=16, old="p032_x97_1290x2796.png", session="S03", speaker="佛系", time="6/18 11:28:46",
         meaning="客户收款码(拼多多)",
         desc="客户发来的拼多多App'二维码收款'页个人收款码（佛系**青），客服反馈'这样扫不到'。",
         ocr="拼多多 二维码收款 | 个人收款码 佛系(**青) | 收款设置 保存收款码 更多设置"),
    dict(id=17, old="p034_x102_828x1124.png", session="S03", speaker="佛系", time="6/18 11:29:30",
         meaning="客户收款码(微信)",
         desc="客户换发的微信个人收款码卡片（推荐使用微信支付，佛系**青），客服随后'扫过去了'返还20元。",
         ocr="推荐使用微信支付 | 佛系(**青) 收款码 | 微信支付"),
    dict(id=18, old="p039_x113_900x1600.png", session="S03", speaker=AGENT, time="6/18 19:26:09",
         meaning="顺丰运单",
         desc="顺丰速运运单照片，运单号 SF1577518773974，手写'7.5×1'，客户佛系订单的发货单号。",
         ocr="顺丰速运 | 运单号 SF1577518773974 | 手写备注 7.5×1"),
    dict(id=19, old="p052_x148_1080x2378.png", session="S04", speaker="ß", time="6/17 12:08:51",
         meaning="付款截图",
         desc="客户付款成功页：¥478.00（日版2.5一盒498-618优惠20），商户'摆个毛线摊'，12:08。",
         ocr="支付成功 | 摆个毛线摊 | ¥478.00"),
    dict(id=20, old="p054_x153_1080x2378.png", session="S04", speaker="ß", time="6/17 12:08:52",
         meaning="付款截图",
         desc="客户缴费详情页：微信支付 ¥478，交易时间 2026-06-17 12:07:47，订单号 82026061712074660199。",
         ocr="缴费详情 | 订单编号 82026061712074660199 | 交易时间 2026-06-17 12:07:47 | 金额 ¥478"),
    dict(id=21, old="p056_x158_1080x1920.png", session="S04", speaker=AGENT, time="6/17 19:55:50",
         meaning="顺丰运单",
         desc="顺丰速运运单照片，运单号 SF1565287041920，手写'2.5×1、冰×2'，收件人莫金妍。",
         ocr="顺丰速运 | 运单号 SF1565287041920 | 备注 2.5×1 冰×2 | 收件人 莫金妍"),
    dict(id=22, old="p068_x183_1280x2781.png", session="S05", speaker=AGENT, time="6/14 16:54:57",
         meaning="珠峰库存实拍",
         desc="珠峰(Everest) Tirzide 库存实拍：多色包装盒堆叠+预灌封注射器，带'Scratch Here'验真二维码，"
              "配文'这是咱们家得 日版孟版珠峰'。",
         ocr="Tirzide 7.5 (Everest) | Tirzepatide INJ | Scratch Here 验真二维码 | 库存实拍"),
    dict(id=23, old="p074_x196_1080x2412.png", session="S05", speaker="阿梅", time="6/14 17:07:39",
         meaning="付款截图",
         desc="客户缴费详情页：微信支付 ¥270（孟版5.0一盒），交易时间 2026-06-14 17:07:09，"
              "订单号 82026061417070825248。",
         ocr="缴费详情 | 订单编号 82026061417070825248 | 交易时间 2026-06-14 17:07:09 | 金额 ¥270"),
    dict(id=24, old="p076_x201_1152x2048.png", session="S05", speaker=AGENT, time="6/14 20:25:23",
         meaning="顺丰运单",
         desc="顺丰速运运单照片，运单号 SF1577516343722，客户阿梅(吴青梅)订单的发货单号。",
         ocr="顺丰速运 | 运单号 SF1577516343722"),
    dict(id=25, old="p082_x214_3024x4032.png", session="S06", speaker="佛系", time="6/18 10:25:40",
         meaning="客户药品实拍", desc="同图9（PDF 中佛系会话的重复导出段落）。", ocr="同图9"),
    dict(id=26, old="p083_x217_3024x4032.png", session="S06", speaker="佛系", time="6/18 10:25:42",
         meaning="客户药品实拍", desc="同图10（PDF 中佛系会话的重复导出段落）。", ocr="同图10"),
    dict(id=27, old="p098_x249_2160x2880.png", session="S07", speaker=AGENT, time="7/6 14:54:40",
         meaning="收款码",
         desc="星驿付聚合收款码（商户'摆个毛线摊'），核对地址后发给客户，配文'付这里就好'。",
         ocr="星驿付 | 欢迎扫码付款 | 商户：摆个毛线摊"),
    dict(id=28, old="p107_x269_1206x2622.png", session="S08", speaker="北北吖", time="7/4 17:21:02",
         meaning="付款截图",
         desc="客户微信账单页：17:20 使用零钱支付'摆个毛线摊'¥370.00（孟版12.5一支），配文'过来了'。",
         ocr="微信支付账单 | 17:20 摆个毛线摊 使用零钱支付 ¥370.00 | 16:47 美团 ¥0.99"),
    dict(id=29, old="p109_x274_1080x1920.png", session="S08", speaker=AGENT, time="7/4 18:17:04",
         meaning="顺丰运单",
         desc="顺丰速运运单照片，运单号 SF1577031874524，手写'12.5×1'，客户北北吖订单的发货单号，配文'宝子单号'。",
         ocr="顺丰速运 | 运单号 SF1577031874524 | 手写备注 12.5×1"),
    dict(id=30, old="p183_收款码.png", session="S19", speaker=AGENT2, time="6/15 20:46:49",
         meaning="收款码",
         desc="星驿付聚合收款码（商户'摆个毛线摊'），客户问'你有码？'后发出，配文'付这里就好'。"
              "（原图导出损坏仅 33×32 像素，同一收款码素材同源，复用图02原件另存）",
         ocr="星驿付 | 欢迎扫码付款 | 商户：摆个毛线摊"),
    dict(id=31, old="p100_x254_1080x1920.png", session="S07", speaker=AGENT, time="7/6 23:47:55",
         meaning="顺丰运单",
         desc="顺丰速运运单照片，运单号 SF1572707607777，手写'2.5、签收后付、高'，客户高校订单的发货单号，配文'宝子单号'。",
         ocr="顺丰速运 | 运单号 SF1572707607777 | 手写备注 2.5 签收后付 高"),
]


def new_name(img):
    t = img["time"].replace("/", "").replace(" ", "-").replace(":", "")
    spk = "客服" if img["speaker"] in (AGENT, AGENT2) else f"客户{img['speaker']}"
    return f"{img['id']:02d}_{spk}_{t}_{img['meaning']}.png"


# ---------------------------------------------------------------------------
# 会话元数据（依据 PDF 正文整理）
# ---------------------------------------------------------------------------
SESSIONS_META = [
    dict(sid="S01", title="第一个顾客", pages=[1, 9], agent=AGENT, customer="nuri",
         duplicate_of=None,
         profile=dict(real_name="努尔姑丽阿不都克日木", phone="13309987099",
                      address="新疆喀什市色满路246号院新9号楼1单元202", region="新疆喀什",
                      order="孟版7.5×4盒", amount_paid=1120, amount_origin=1200, discount=80,
                      waybill="SF1577518814895", waybill_image=4)),
    dict(sid="S02", title="第二个顾客", pages=[9, 20], agent=AGENT, customer="余生",
         duplicate_of=None,
         profile=dict(real_name="许银春", phone="18359641633",
                      address="福建省漳州市云霄县莆美镇北西路大唐印象3号楼1404", region="福建漳州",
                      order="孟版7.5×1盒", amount_paid=280, amount_origin=300, discount=20,
                      waybill="SF1577518773992", waybill_image=8)),
    dict(sid="S03", title="第三个顾客", pages=[20, 40], agent=AGENT, customer="佛系",
         duplicate_of=None,
         profile=dict(real_name="薛美青", phone="18575263121",
                      address="广东省惠州市惠阳区大亚湾西区龙山六路18号龙岭雅居2栋601", region="广东惠州",
                      order="孟版7.5×1盒", amount_paid=300, amount_origin=300, discount=20,
                      discount_note="客户先付300，客服扫客户个人收款码返还20",
                      waybill="SF1577518773974", waybill_image=18)),
    dict(sid="S04", title="第四个客户", pages=[40, 60], agent=AGENT, customer="ß",
         duplicate_of=None,
         profile=dict(real_name="莫金妍", phone="13558245027",
                      address="广东省深圳市宝安区松岗街道朗下社区沙朗路84号客家雅苑农庄", region="广东深圳",
                      order="日版2.5×1盒(两支)", amount_paid=478, amount_origin=498, discount=20,
                      waybill="SF1565287041920", waybill_image=21)),
    dict(sid="S05", title="第五个客户", pages=[60, 81], agent=AGENT, customer="阿梅",
         duplicate_of=None,
         profile=dict(real_name="吴青梅", phone="13612217715",
                      address="广东省佛山市南海区里水镇和南村和南大道二路三港一号", region="广东佛山",
                      order="孟版5.0×1盒", amount_paid=270, amount_origin=270, discount=0,
                      waybill="SF1577516343722", waybill_image=24)),
    dict(sid="S06", title="第六个人", pages=[81, 95], agent=AGENT, customer="佛系",
         duplicate_of="S03",
         profile=dict(note="与S03为同一客户同一会话的重复导出（PDF排版重复），消息与S03一致")),
    dict(sid="S07", title="第七个人", pages=[95, 102], agent=AGENT, customer="高校",
         duplicate_of=None,
         profile=dict(real_name="高(备注名)", phone="13310327666",
                      address="内蒙古鄂尔多斯市东胜区万正城D区5-1-1401", region="内蒙古鄂尔多斯",
                      order="日版2.5×1盒(两支)", amount_paid=548, amount_origin=548, discount=0,
                      waybill="SF1572707607777", waybill_image=31)),
    dict(sid="S08", title="第八个人", pages=[102, 110], agent=AGENT, customer="北北吖",
         duplicate_of=None,
         profile=dict(real_name="范(备注名)", phone="19521961094",
                      address="德阳市旌阳区望龙东郡1栋", region="四川德阳",
                      order="孟版12.5×1支", amount_paid=370, amount_origin=370, discount=0,
                      waybill="SF1577031874524", waybill_image=29)),
    dict(sid="S09", title="第九个人", pages=[110, 119], agent=AGENT, customer="我相信",
         duplicate_of=None,
         profile=dict(real_name="小馒头", phone="18157940235",
                      address="浙江省金华市永康市西城街道滨江悦虹湾20-2-1002", region="浙江金华",
                      order="日版5.0×1盒(两支)", amount_paid=678, amount_origin=698, discount=20,
                      waybill=None, waybill_note="客服承诺发单号，运单照片未含在提取图片中")),
    dict(sid="S10", title="第10个人", pages=[119, 126], agent=AGENT, customer="EMIT",
         duplicate_of=None,
         profile=dict(real_name="郭文", phone="19884512678",
                      address="山西省晋中市榆次区雅居乐熙苑5号楼一单元1401", region="山西晋中",
                      order="珠峰2.5×1盒", amount_paid=None,
                      amount_note="对话中未出现价格确认与付款截图",
                      waybill=None, waybill_note="客服发'宝子单号'，运单照片未含在提取图片中")),
    dict(sid="S11", title="第11个人", pages=[126, 134], agent=AGENT, customer="心柿",
         duplicate_of=None,
         profile=dict(real_name="曲木忆南", phone="13038606920",
                      address="云南省迪庆藏族自治州香格里拉市建塘镇古城北门香·遇文创集市", region="云南迪庆",
                      order="日版2.5×1盒(两支)", amount_paid=498, amount_origin=498, discount=0,
                      waybill=None, waybill_note="客服发'宝子单号'，运单照片未含在提取图片中")),
    dict(sid="S12", title="第十二个人", pages=[134, 144], agent=AGENT, customer="佛系",
         duplicate_of="S03",
         profile=dict(note="与S03为同一客户同一会话的重复导出（PDF排版重复），消息与S03一致")),
    dict(sid="S13", title="第十三个人", pages=[144, 154], agent=AGENT, customer="ß",
         duplicate_of="S04",
         profile=dict(note="与S04为同一客户同一会话的重复导出（PDF排版重复），消息与S04一致")),
    dict(sid="S14", title="第十四个人", pages=[154, 159], agent=AGENT, customer="小李要早睡",
         duplicate_of=None,
         profile=dict(real_name="李泓晔", phone="17888817325",
                      address="吉林省吉林市昌邑区兴华街道松江欣都小区17号楼2单元2楼中门202室", region="吉林省吉林市",
                      order="孟版7.5×2盒", amount_paid=560, amount_origin=600, discount=40,
                      waybill=None, waybill_note="客服承诺次日给单号，运单照片未含在提取图片中")),
    dict(sid="S15", title="第十五个人", pages=[159, 164], agent=AGENT2, customer="微微",
         duplicate_of=None,
         profile=dict(real_name="微微", phone="18684693033",
                      address="湖南省浏阳市永和镇沿宝路龙晟系统门窗", region="湖南浏阳",
                      order="孟版10.0×1支", amount_paid=340, amount_origin=340, discount=0,
                      payment="微信转账", waybill=None,
                      waybill_note="客服承诺发单号，运单照片未含在提取图片中")),
    dict(sid="S16", title="第16个人", pages=[164, 169], agent=AGENT2, customer="静宇",
         duplicate_of=None,
         profile=dict(real_name="大宇", phone="13464529797",
                      address="辽宁省丹东市东港市长山镇富家村", region="辽宁丹东",
                      order="日版5.0×1盒(两支)", amount_paid=698, amount_origin=698, discount=0,
                      payment="微信转账", waybill=None,
                      waybill_note="客服承诺晚上发单号，运单照片未含在提取图片中")),
    dict(sid="S17", title="第17个人", pages=[169, 176], agent=AGENT2, customer="ok绷遮不住我颓废的伤",
         duplicate_of=None,
         profile=dict(real_name="魏燕", phone="13830389992",
                      address="甘肃省平凉市崆峒区望康家园2号楼", region="甘肃平凉",
                      order="孟版2.5×2支", amount_paid=440, amount_origin=460, discount=20,
                      amount_note="230×2-10×2=440，客户18:02:37确认'已付款'（付款截图未含在提取图片中）",
                      waybill=None, waybill_note="客服承诺发单号，运单照片未含在提取图片中")),
    dict(sid="S18", title="第十八个人", pages=[176, 179], agent=AGENT2, customer="小爽",
         duplicate_of=None,
         profile=dict(real_name=None, phone="13953522172",
                      address="山东烟台市莱山区莱山镇政府大街东庄村", region="山东烟台",
                      order="孟版5.0×1支", amount_paid=270, amount_origin=270, discount=0,
                      payment="微信红包（企业微信未开通收款/转账）",
                      waybill=None, waybill_note="客服承诺发单号，运单照片未含在提取图片中")),
    dict(sid="S19", title="第19个人", pages=[179, 183], agent=AGENT2, customer="ℳঞᩚ꧔",
         duplicate_of=None,
         profile=dict(real_name="小屈", phone="18224558270",
                      address="郑州市金水区丰庆路豫武康居二号楼一单元23楼", region="河南郑州",
                      order="孟版2.5×1支", amount_paid=210, amount_origin=230, discount=20,
                      discount_note="618活动优惠20", waybill=None,
                      waybill_note="客服承诺发单号，运单照片未含在提取图片中")),
]

TITLE_RE = re.compile(r"^(?:《(?:第[一二三四五六七八九十\d]+个(?:顾客|客户))》|第[一二三四五六七八九十\d]+\s*个人)$")
CS_RE = re.compile(r"^(替替（正品）|泡泡)\(.*?\)\s(\d{1,2}/\d{1,2} \d{1,2}:\d{2}:\d{2})$")
WX_RE = re.compile(r"^(.*?)@微信@微信联系人(\d{1,2}/\d{1,2} \d{1,2}:\d{1,2}:\d{2})$")
PAGE_RE = re.compile(r"^===== PAGE (\d+) =====$")

# 图片插入位置：会话 -> [(发言人匹配, 消息时间, 图片id)]
IMG_PLACEMENT = {
    "S01": [(AGENT, "6/20 17:06:15", 1), (AGENT, "6/20 17:51:19", 2),
            ("nuri", "6/20 19:31:34", 3), (AGENT, "6/20 20:00:11", 4)],
    "S02": [(AGENT, "6/18 16:30:37", 5), (AGENT, "6/18 17:07:05", 6),
            ("余生", "6/18 17:07:46", 7), (AGENT, "6/18 19:52:33", 8)],
    "S03": [("佛系", "6/18 10:25:40", 9), ("佛系", "6/18 10:25:42", 10),
            (AGENT, "6/18 10:26:29", 11),
            ("佛系", "6/18 11:27:52", 15), ("佛系", "6/18 11:28:46", 16),
            ("佛系", "6/18 11:29:30", 17), (AGENT, "6/18 19:26:09", 18)],
    "S04": [("ß", "6/17 12:08:51", 19), ("ß", "6/17 12:08:52", 20),
            (AGENT, "6/17 10:35:00", 12), (AGENT, "6/17 10:35:17", 13),
            (AGENT, "6/17 10:35:20", 14), (AGENT, "6/17 19:55:50", 21)],
    "S05": [(AGENT, "6/14 16:54:57", 22), ("阿梅", "6/14 17:07:39", 23),
            (AGENT, "6/14 20:25:23", 24)],
    "S06": [("佛系", "6/18 10:25:40", 25), ("佛系", "6/18 10:25:42", 26)],
    "S07": [(AGENT, "7/6 14:54:40", 27), (AGENT, "7/6 23:47:55", 31)],
    "S08": [("北北吖", "7/4 17:21:02", 28), (AGENT, "7/4 18:17:04", 29)],
    "S19": [(AGENT2, "6/15 20:46:49", 30)],
}


# ---------------------------------------------------------------------------
# 解析 chat_text.txt
# ---------------------------------------------------------------------------
def norm(s):
    return re.sub(r"\s+", "", s or "")


def parse_text():
    lines = SRC_TXT.read_text(encoding="utf-8").splitlines()

    # 预扫描：为每个客户发言人(@微信)行确定完整名字
    # —— 名字可能独占一行(nuri)甚至多行(装饰性昵称)，会与普通内容行混淆
    wx_name, name_idx = {}, set()
    ORNATE = r"[ℳঞᩚ꧔ꦿᩚ᭄:\s]+"
    for i, raw in enumerate(lines):
        m = WX_RE.match(raw.strip())
        if not m:
            continue
        g1 = m.group(1)
        j = i - 1
        while j >= 0 and not lines[j].strip():
            j -= 1
        prev = lines[j].strip() if j >= 0 else ""
        if g1 == "꧔" and re.fullmatch(ORNATE, prev or " "):
            parts, k = [], j
            while k >= 0 and re.fullmatch(ORNATE, lines[k].strip() or " "):
                parts.insert(0, lines[k].strip())
                name_idx.add(k)
                k -= 1
            wx_name[i] = "".join(parts)
        elif g1:
            wx_name[i] = g1
        elif prev and not (PAGE_RE.match(prev) or CS_RE.match(prev) or WX_RE.match(prev)):
            wx_name[i] = prev
            name_idx.add(j)
        else:
            wx_name[i] = ""

    sessions, cur, msg = [], None, None
    cur_page = None

    def flush():
        nonlocal msg
        if msg is not None and cur is not None:
            msg["content"] = "\n".join(msg["content"]).strip()
            cur["messages"].append(msg)
        msg = None

    def flush_session():
        nonlocal cur
        flush()
        if cur is not None:
            sessions.append(cur)
        cur = None

    for i, raw in enumerate(lines):
        if i in name_idx:
            continue
        line = raw.strip()
        m = PAGE_RE.match(line)
        if m:
            cur_page = int(m.group(1))
            continue
        if not line:
            continue
        if TITLE_RE.match(line):
            flush_session()
            cur = dict(title=line.strip("《》"), messages=[], start_page=cur_page)
            continue
        m = CS_RE.match(line)
        if m:
            flush()
            msg = dict(speaker=m.group(1), time=m.group(2), content=[], page=cur_page)
            continue
        if WX_RE.match(line):
            flush()
            msg = dict(speaker=norm(wx_name.get(i, "")), time=WX_RE.match(line).group(2),
                       content=[], page=cur_page)
            continue
        if msg is not None:
            msg["content"].append(line)
    flush_session()
    return [s for s in sessions if s["messages"]]


def speaker_matches(parsed_speaker, key):
    return norm(parsed_speaker) == norm(key) or norm(parsed_speaker).startswith(norm(key))


def attach_images(parsed, meta_list):
    """按 IMG_PLACEMENT 把图片挂到对应消息上"""
    for meta, sess in zip(meta_list, parsed):
        for spk, t, iid in IMG_PLACEMENT.get(meta["sid"], []):
            hit = next((m for m in sess["messages"]
                        if speaker_matches(m["speaker"], spk) and m["time"] == t), None)
            if hit is None:
                raise RuntimeError(f"{meta['sid']}: 未找到图片锚点消息 {spk} {t}")
            hit.setdefault("images", []).append(iid)


def ensure_renamed():
    """幂等：旧名存在则重命名；新名已存在则校验通过"""
    IMG_DIR.mkdir(exist_ok=True)
    for img in IMAGES:
        dst = IMG_DIR / new_name(img)
        old = IMG_DIR / img["old"]
        if img["old"] == "p183_收款码.png":
            if not dst.exists():
                raise RuntimeError("缺少图30：请先从 PDF 提取第183页收款码图片")
            continue
        if old.exists():
            old.rename(dst)
        if not dst.exists():
            raise RuntimeError(f"缺少图片：{dst}")
    # spec.png / 规格.png 原件保留不动，仅拷贝一份到 imgs/ 供 JSON 引用（幂等）
    if not SPEC_DST.exists():
        src = SPEC_SRC if SPEC_SRC.exists() else SPEC_DUP
        if not src.exists():
            raise RuntimeError("缺少价格表原图：spec.png / 规格.png 均不存在")
        shutil.copy(src, SPEC_DST)


def build():
    ensure_renamed()
    parsed = parse_text()
    assert len(parsed) == len(SESSIONS_META), \
        f"解析出 {len(parsed)} 个会话，预期 {len(SESSIONS_META)}"
    attach_images(parsed, SESSIONS_META)

    img_by_id = {i["id"]: i for i in IMAGES}

    def img_ref(iid):
        i = img_by_id[iid]
        return {"image_id": iid, "file": "imgs/" + new_name(i),
                "meaning": i["meaning"], "description": i["desc"]}

    images_out = []
    for i in IMAGES:
        pdf_page = re.match(r"p(\d+)", i["old"])
        images_out.append({
            "image_id": i["id"],
            "file": "imgs/" + new_name(i),
            "renamed_from": None if i["old"] == "p183_收款码.png" else "imgs/" + i["old"],
            "pdf_page": int(pdf_page.group(1)) if pdf_page else 183,
            "session_id": i["session"],
            "speaker": i["speaker"],
            "role": "客服" if i["speaker"] in (AGENT, AGENT2) else "客户",
            "sent_at": "2026-" + i["time"].replace("/", "-"),
            "meaning": i["meaning"],
            "description": i["desc"],
            "key_text": i["ocr"],
        })

    sessions_out = []
    for meta, sess in zip(SESSIONS_META, parsed):
        msgs_out = []
        for n, m in enumerate(sess["messages"], 1):
            is_agent = m["speaker"] in (AGENT, AGENT2)
            has_img = bool(m.get("images"))
            mtype = ("image" if not m["content"] else "text+image") if has_img else "text"
            entry = {
                "id": f"{meta['sid']}-{n:03d}",
                "speaker": m["speaker"],
                "role": "客服" if is_agent else "客户",
                "sent_at": "2026-" + m["time"].replace("/", "-"),
                "type": mtype,
                "text": m["content"],
                "pdf_page": m["page"],
            }
            if has_img:
                entry["images"] = [img_ref(x) for x in m["images"]]
            msgs_out.append(entry)
        sessions_out.append({
            "session_id": meta["sid"],
            "title": meta["title"],
            "sales_agent": meta["agent"],
            "customer_alias": meta["customer"],
            "pdf_pages": meta["pages"],
            "duplicate_of": meta["duplicate_of"],
            "customer_profile": meta["profile"],
            "message_count": len(msgs_out),
            "messages": msgs_out,
        })

    orders = []
    for meta in SESSIONS_META:
        p = meta["profile"]
        if meta["duplicate_of"] is None and p.get("order"):
            orders.append({
                "session_id": meta["sid"], "customer": meta["customer"],
                "real_name": p.get("real_name"), "product": p["order"],
                "amount_paid": p.get("amount_paid"), "discount": p.get("discount", 0),
                "waybill": p.get("waybill"),
            })

    spec = {
        "image_id": 0,
        "file": "imgs/" + SPEC_DST.name,
        "renamed_from": "context/spec.png（context/规格.png 为同一文件的重复副本，两份原件均保留）",
        "session_id": None,
        "speaker": AGENT, "role": "客服物料", "sent_at": None,
        "meaning": "全规格价格表",
        "description": next(i["desc"] for i in IMAGES if i["id"] == 1),
        "key_text": next(i["ocr"] for i in IMAGES if i["id"] == 1),
    }

    out = {
        "meta": {
            "source_pdf": "聊天记录.pdf",
            "source_text": "chat_text.txt（PDF 文字层提取）",
            "title": "私域电商售前客服真实聊天记录（替西帕肽）",
            "exported_at": "2026-06 至 2026-07（依据付款凭证交易时间 2026-06-14~2026-07-06 与顺丰面单版式 2026年04月）",
            "timezone": "Asia/Shanghai",
            "participants": {
                "customer_service": [
                    {"name": AGENT, "serves": "第1-14位客户"},
                    {"name": AGENT2, "serves": "第15-19位客户"},
                ],
                "customers": "共19段客户会话；其中佛系出现3次(S03/S06/S12)、ß出现2次(S04/S13)，去重后为16位独立客户",
            },
            "payment_merchant": "收款商户：摆个毛线摊（星驿付聚合收款码）",
            "notes": [
                "PDF 为微信聊天记录导出，嵌入图片已单独提取并按『序号_发言人_日期时间_含义』重命名，renamed_from 记录重命名前的旧文件名（仅作历史溯源，旧文件已不存在）",
                "全规格价格表原件 context/spec.png 与 context/规格.png 均保留，imgs/ 内另存一份供 JSON 引用",
                "图片的 speaker/sent_at 取自聊天中承载该图片的消息（发送人+时间戳）",
                "佛系(S03/S06/S12)与ß(S04/S13)的会话在 PDF 中重复导出，内容一致，JSON 保留原结构并以 duplicate_of 标注",
                "图30：PDF 第183页原图导出损坏(33×32像素)，同一收款码素材同源，复用图02原件并另存",
                "部分客服发送的[视频]、[动画表情]未导出媒体，仅保留文字占位",
            ],
        },
        "reference_materials": [spec],
        "images": [spec] + images_out,
        "order_summary": orders,
        "sessions": sessions_out,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    total_imgs = sum(len(m.get("images", [])) for s in sessions_out for m in s["messages"])
    print(f"✓ 会话 {len(sessions_out)} 个，消息 {sum(s['message_count'] for s in sessions_out)} 条，"
          f"图片引用 {total_imgs} 处（登记 {len(IMAGES)+1} 张含价格表）")
    print(f"✓ 输出：{OUT_JSON}")


if __name__ == "__main__":
    build()
