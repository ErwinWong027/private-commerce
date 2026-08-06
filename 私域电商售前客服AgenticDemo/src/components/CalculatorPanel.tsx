"use client";

interface CalculatorPanelProps {
  calcType: string;
  calcPrice: number;
  calcHours: number;
  calcResult: string;
  title?: string;
  description?: string;
  className?: string;
  submitLabel?: string;
  onTypeChange: (value: string) => void;
  onPriceChange: (value: number) => void;
  onHoursChange: (value: number) => void;
  onRun: () => void;
}

export function CalculatorPanel({
  calcType,
  calcPrice,
  calcHours,
  calcResult,
  title = "费用快速计算器",
  description,
  className,
  submitLabel = "测算费用",
  onTypeChange,
  onPriceChange,
  onHoursChange,
  onRun,
}: CalculatorPanelProps) {
  return (
    <section className={className ? `calc-panel ${className}` : "calc-panel"}>
      <h2>{title}</h2>
      {description ? <p className="calc-panel-description">{description}</p> : null}
      <div className="calc-grid">
        <div className="form-group">
          <label htmlFor="calc-type-select">规则类型</label>
          <select id="calc-type-select" value={calcType} onChange={(event) => onTypeChange(event.target.value)}>
            <option value="domestic">普通规则类别 A</option>
            <option value="laos">特殊规则类别 B</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="calc-price-input">基准价格 (元)</label>
          <input
            id="calc-price-input"
            type="number"
            value={calcPrice}
            onChange={(event) => onPriceChange(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="calc-hours-input">时间参数 (小时/天)</label>
        <input
          id="calc-hours-input"
          type="number"
          value={calcHours}
          onChange={(event) => onHoursChange(Number(event.target.value))}
        />
        <span className="helper-text">提示: 输入测试时间间隔(小时)，评估阶梯费率。</span>
      </div>

      <button className="calc-button" onClick={onRun}>
        {submitLabel}
      </button>

      {calcResult && (
        <div className="calc-result-box">
          <strong>测算结果：</strong>
          {calcResult}
        </div>
      )}
    </section>
  );
}
