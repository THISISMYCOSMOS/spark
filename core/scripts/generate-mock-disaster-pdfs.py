from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")

ALERTS = [
    {
        "filename": "mock-disaster-alert-typhoon.pdf",
        "accent": colors.HexColor("#2563EB"),
        "icon": "태풍",
        "fields": {
            "DOCUMENT_TYPE": "MOCK_DISASTER_ALERT_V1",
            "ALERT_ID": "MOCK-TYPHOON-20260814-001",
            "MODE": "TEST",
            "DISASTER_TYPE": "TYPHOON",
            "STATUS": "ACTIVE",
            "SEVERITY": "SEVERE",
            "REGION_CODE": "99001",
            "ISSUED_AT": "2026-08-14T09:00:00+09:00",
            "EFFECTIVE_AT": "2026-08-14T09:10:00+09:00",
            "EXPECTED_END_AT": "2026-08-15T06:00:00+09:00",
            "TITLE_KO": "[목업] 강풍과 집중호우를 동반한 태풍 경보",
            "GUIDANCE_CODES": "FOLLOW_OFFICIAL_ALERTS,KEEP_DEVICE_DRY,NEVER_USE_GENERATOR_INDOORS",
            "MESSAGE_KO": "강풍과 침수 위험이 있습니다. 공식 대피 안내를 확인하고 전원 장치를 물에서 보호하세요.",
        },
        "summary": "강풍·침수와 정전 가능성이 있는 태풍 상황을 가정합니다.",
        "guidance": [
            "공식 재난 알림과 대피 명령을 계속 확인하세요.",
            "의료기기와 전원 장치를 빗물과 침수로부터 보호하세요.",
            "발전기는 실내나 밀폐 공간에서 사용하지 마세요.",
        ],
    },
    {
        "filename": "mock-disaster-alert-earthquake.pdf",
        "accent": colors.HexColor("#D97706"),
        "icon": "지진",
        "fields": {
            "DOCUMENT_TYPE": "MOCK_DISASTER_ALERT_V1",
            "ALERT_ID": "MOCK-EARTHQUAKE-20260814-001",
            "MODE": "TEST",
            "DISASTER_TYPE": "EARTHQUAKE",
            "STATUS": "ACTIVE",
            "SEVERITY": "WARNING",
            "REGION_CODE": "99002",
            "ISSUED_AT": "2026-08-14T10:00:00+09:00",
            "EFFECTIVE_AT": "2026-08-14T10:00:00+09:00",
            "EXPECTED_END_AT": "2026-08-14T16:00:00+09:00",
            "TITLE_KO": "[목업] 강한 흔들림이 감지된 지진 경보",
            "GUIDANCE_CODES": "DROP_COVER_HOLD_ON,CHECK_DEVICE_DAMAGE_AFTER_SHAKING,AVOID_DAMAGED_POWER_CONNECTION",
            "MESSAGE_KO": "흔들림 중 몸을 보호하세요. 이후 의료기기와 전원선의 눈에 보이는 손상을 확인하세요.",
        },
        "summary": "강한 흔들림과 전원·기기 손상 가능성이 있는 지진 상황을 가정합니다.",
        "guidance": [
            "흔들림 중에는 엎드리고 몸을 보호한 뒤 붙잡으세요.",
            "흔들림이 멈춘 뒤 의료기기와 전원선의 손상을 눈으로 확인하세요.",
            "손상되거나 젖은 전원 연결부는 사용하지 마세요.",
        ],
    },
    {
        "filename": "mock-disaster-alert-cold-wave.pdf",
        "accent": colors.HexColor("#0891B2"),
        "icon": "한파",
        "fields": {
            "DOCUMENT_TYPE": "MOCK_DISASTER_ALERT_V1",
            "ALERT_ID": "MOCK-COLD-WAVE-20260814-001",
            "MODE": "TEST",
            "DISASTER_TYPE": "COLD_WAVE",
            "STATUS": "ACTIVE",
            "SEVERITY": "WARNING",
            "REGION_CODE": "99003",
            "ISSUED_AT": "2026-08-14T11:00:00+09:00",
            "EFFECTIVE_AT": "2026-08-14T18:00:00+09:00",
            "EXPECTED_END_AT": "2026-08-16T09:00:00+09:00",
            "TITLE_KO": "[목업] 급격한 기온 저하가 예상되는 한파 경보",
            "GUIDANCE_CODES": "FOLLOW_OFFICIAL_ALERTS,MAINTAIN_SAFE_INDOOR_TEMPERATURE,PREVENT_CARBON_MONOXIDE",
            "MESSAGE_KO": "기온이 크게 낮아집니다. 실내 보온과 난방기구 환기 수칙을 확인하세요.",
        },
        "summary": "저온과 난방 수요 증가로 정전 위험이 높아지는 한파 상황을 가정합니다.",
        "guidance": [
            "공식 한파 안내에 따라 안전한 실내 온도를 유지하세요.",
            "등록된 보조전원의 사용 가능 여부를 확인하세요.",
            "연료 난방기구 사용 시 환기와 일산화탄소 안전수칙을 지키세요.",
        ],
    },
    {
        "filename": "mock-disaster-alert-fire.pdf",
        "accent": colors.HexColor("#DC2626"),
        "icon": "화재",
        "fields": {
            "DOCUMENT_TYPE": "MOCK_DISASTER_ALERT_V1",
            "ALERT_ID": "MOCK-FIRE-20260814-001",
            "MODE": "TEST",
            "DISASTER_TYPE": "FIRE",
            "STATUS": "ACTIVE",
            "SEVERITY": "SEVERE",
            "REGION_CODE": "99004",
            "ISSUED_AT": "2026-08-14T12:00:00+09:00",
            "EFFECTIVE_AT": "2026-08-14T12:00:00+09:00",
            "EXPECTED_END_AT": "2026-08-14T15:00:00+09:00",
            "TITLE_KO": "[목업] 인근 건물 화재에 따른 긴급 대피 안내",
            "GUIDANCE_CODES": "EVACUATE_FOR_FIRE,DO_NOT_REENTER_FIRE_AREA,CALL_119_IF_IMMEDIATE_DANGER",
            "MESSAGE_KO": "연기와 화염 위험이 있습니다. 즉시 대피하고 안전 확인 전에는 다시 들어가지 마세요.",
        },
        "summary": "연기·화염과 긴급 대피가 필요한 건물 화재 상황을 가정합니다.",
        "guidance": [
            "소지품을 챙기려 머무르지 말고 공식 대피 경로로 즉시 대피하세요.",
            "소방당국이 안전하다고 확인하기 전에는 다시 들어가지 마세요.",
            "생명에 즉각적인 위험이 있으면 안전한 곳에서 119에 연락하세요.",
        ],
    },
]


def register_fonts():
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise FileNotFoundError("Malgun Gothic fonts are required")
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))


def header_footer(canvas, doc, alert):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(alert["accent"])
    canvas.rect(0, height - 18 * mm, width, 18 * mm, fill=1, stroke=0)
    canvas.setFont("MalgunBold", 13)
    canvas.setFillColor(colors.white)
    canvas.drawString(17 * mm, height - 11.5 * mm, "CHIC 재난 대응 시스템 · 업로드 테스트 문서")
    canvas.setFont("MalgunBold", 44)
    canvas.setFillColor(colors.Color(0.86, 0.08, 0.08, alpha=0.08))
    canvas.translate(width / 2, height / 2)
    canvas.rotate(32)
    canvas.drawCentredString(0, 0, "TEST ONLY · 실제 재난 아님")
    canvas.restoreState()


def build_pdf(alert):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / alert["filename"]
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=26 * mm,
        bottomMargin=15 * mm,
        title=alert["fields"]["TITLE_KO"],
        author="CHIC Backend B Test Fixture Generator",
        subject="Mock disaster alert for TEST mode only",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title-ko", parent=styles["Title"], fontName="MalgunBold", fontSize=23, leading=31, textColor=colors.HexColor("#111827"), spaceAfter=4 * mm)
    center = ParagraphStyle("center-ko", parent=styles["BodyText"], fontName="MalgunBold", fontSize=12, leading=18, alignment=TA_CENTER, textColor=colors.HexColor("#B91C1C"))
    body = ParagraphStyle("body-ko", parent=styles["BodyText"], fontName="Malgun", fontSize=10.5, leading=18, textColor=colors.HexColor("#374151"))
    label = ParagraphStyle("label-ko", parent=body, fontName="MalgunBold", fontSize=11.5, textColor=alert["accent"], spaceAfter=2 * mm)
    machine = ParagraphStyle("machine", parent=styles["Code"], fontName="Malgun", fontSize=6.6, leading=9.0, textColor=colors.HexColor("#111827"))

    story = [
        Spacer(1, 3 * mm),
        Paragraph("목업 재난문자 · " + alert["icon"], title),
        Paragraph("TEST ONLY · 실제 재난·대피 명령이 아닙니다", center),
        Spacer(1, 5 * mm),
    ]
    info = [
        ["재난 유형", alert["icon"], "심각도", alert["fields"]["SEVERITY"]],
        ["가상 지역코드", alert["fields"]["REGION_CODE"], "전환 상태", "ACTIVE"],
        ["발령 시각", alert["fields"]["ISSUED_AT"], "종료 예상", alert["fields"]["EXPECTED_END_AT"]],
    ]
    table = Table(info, colWidths=[26 * mm, 54 * mm, 25 * mm, 57 * mm], rowHeights=[11 * mm] * 3)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Malgun"),
        ("FONTNAME", (0, 0), (0, -1), "MalgunBold"),
        ("FONTNAME", (2, 0), (2, -1), "MalgunBold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.2),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F3F4F6")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([table, Spacer(1, 6 * mm), Paragraph("상황 요약", label), Paragraph(alert["summary"], body), Spacer(1, 4 * mm), Paragraph("목업 안내 내용", label)])
    for index, item in enumerate(alert["guidance"], start=1):
        story.append(Paragraph(f"{index}. {item}", body))
    story.extend([Spacer(1, 6 * mm), Paragraph("백엔드 판독용 정형 필드", label)])
    machine_lines = [f"{key}: {value}" for key, value in alert["fields"].items()]
    machine_content = "<br/>".join(line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") for line in machine_lines)
    machine_table = Table([[Paragraph(machine_content, machine)]], colWidths=[176 * mm])
    machine_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#94A3B8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(machine_table)
    doc.build(story, onFirstPage=lambda canvas, document: header_footer(canvas, document, alert))
    return path


def main():
    register_fonts()
    paths = [build_pdf(alert) for alert in ALERTS]
    for path in paths:
        print(path)


if __name__ == "__main__":
    main()
