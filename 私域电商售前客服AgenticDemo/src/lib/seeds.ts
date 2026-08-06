import { Ticket } from "@/types";

// Helper function to format simulated local dates relative to reference time
function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatLocalDateTime(date: Date): string {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join("T");
}

function resolveReferenceTime(referenceTime?: string | Date): Date {
  const parsed = referenceTime instanceof Date ? new Date(referenceTime.getTime()) : referenceTime ? new Date(referenceTime) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function createDateAt(referenceTime: Date, dayOffset: number, hour: number, minute: number): Date {
  const date = new Date(referenceTime);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function shiftDate(referenceTime: Date, hours = 0, minutes = 0): Date {
  const date = new Date(referenceTime);
  date.setHours(date.getHours() + hours);
  date.setMinutes(date.getMinutes() + minutes);
  date.setSeconds(0, 0);
  return date;
}

/**
 * Creates initial seed records for the mock database.
 * Change/Rename this function and return structures to match your custom business entity.
 */
export function createInitialEntities(referenceTime?: string | Date): Ticket[] {
  const baseTime = resolveReferenceTime(referenceTime);
  const t1Departure = createDateAt(baseTime, 1, 14, 30);
  const t1Arrival = createDateAt(baseTime, 1, 18, 58);
  const t2Departure = createDateAt(baseTime, 1, 8, 0);
  const t2Arrival = createDateAt(baseTime, 1, 8, 58);
  const t3Departure = shiftDate(baseTime, -1);
  
  const purchaseTime = formatLocalDateTime(shiftDate(baseTime, -1));

  return [
    {
      id: "T1001",
      trainNo: "G101",
      from: "北京南",
      to: "上海虹桥",
      departureTime: formatLocalDateTime(t1Departure),
      arrivalTime: formatLocalDateTime(t1Arrival),
      price: 550,
      ticketType: "普通票",
      status: "未使用",
      paymentMethod: "电子支付",
      invoiceStatus: "未领取",
      rebookCount: 0,
      passengerName: "张三",
      passengerIdMasked: "1101**********126",
      carriageNo: "05车",
      seatLabel: "12A号 一等座",
      orderChannel: "官网",
      ticketSerial: "E389168326111002C",
      specialRebookScenario: "NONE",
      purchaseTime,
    },
    {
      id: "T1002",
      trainNo: "G5",
      from: "广州南",
      to: "香港西九龙",
      departureTime: formatLocalDateTime(t2Departure),
      arrivalTime: formatLocalDateTime(t2Arrival),
      price: 215,
      ticketType: "广深港跨境票",
      status: "未使用",
      paymentMethod: "电子支付",
      invoiceStatus: "未领取",
      rebookCount: 0,
      passengerName: "李四",
      passengerIdMasked: "1101**********126",
      carriageNo: "03车",
      seatLabel: "08C号 二等座",
      orderChannel: "窗口",
      ticketSerial: "E481902563771215B",
      specialRebookScenario: "NONE",
      purchaseTime,
    },
    {
      id: "T1003",
      trainNo: "G105",
      from: "北京南",
      to: "上海虹桥",
      departureTime: formatLocalDateTime(t3Departure),
      arrivalTime: formatLocalDateTime(shiftDate(t3Departure, 4)),
      price: 550,
      ticketType: "普通票",
      status: "已乘车",
      paymentMethod: "电子支付",
      invoiceStatus: "未领取",
      rebookCount: 0,
      passengerName: "王五",
      passengerIdMasked: "1101**********126",
      carriageNo: "09车",
      seatLabel: "16D号 一等座",
      orderChannel: "官网",
      ticketSerial: "E772916305105293S",
      specialRebookScenario: "NONE",
      purchaseTime,
    }
  ];
}
