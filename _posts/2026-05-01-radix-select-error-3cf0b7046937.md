---
title: Radix Select에서 빈 문자열 value 처리로 인해 발생한 에러 해결
date: '2026-05-01 00:00:00 +0900'
permalink: /posts/radix-select-error/
categories:
  - Troubleshooting
tags:
  - React
  - Radix UI
notion_id: 3cf0b704-6937-80e5-964a-ceeceef21816
notion_last_edited: '2026-09-06T17:58:00.000Z'
notion_asset_dir: assets/img/posts/radix-select-error-3cf0b7046937
notion_sync_version: 3
---

# 🌱 Context


초기 개발 단계에서 화면 구현과 동작 검증을 위해 Select 옵션을 하드코딩 하여 사용하였고, 이때는 문제가 없었습니다.


하지만 API 연동을 통해 옵션 데이터를 동적으로 불러오는 구조로 변경하면서 문제가 발생하였습니다.


그리하여 로딩 상태 및 fallback 처리를 위해 다음과 같은 임시 옵션 코드를 작성하였습니다.


```javascript
const options = apiOptions.length
  ? apiOptions
  : [{ value: '', label: 'Loading...' }]
```


<br>


## 🚨 Problem


```plaintext
A <Select.Item /> must have a value prop that is not an empty string.

This is because the Select value can be set to an empty string to clear the selection and show the placeholder.
```


`Radix UI` 기반의 `shadcn/ui Select` 컴포넌트에서 `SelectItem`의 `value`로 빈 문자열(`""`)을 전달하자 위와 같은 에러가 발생하였습니다.


해당 에러는 사용자가 Select 옵션을 선택할 수 없는 행위를 야기 시켰습니다.


<br>


## 🔍 Cause


Radix Select에서 빈 문자열(`""`)은 일반적인 옵션 값이 아니라, **선택 값을 비우고 placeholder를 표시하기 위한 내부 예약 값**으로 사용됩니다.


```javascript
<SelectItem value="">Example</SelectItem>
```


이처럼 실제 선택 가능한 옵션에 빈 문자열을 사용하면 Radix 내부 로직과 충돌이 발생합니다.


placeholder, loading, fallback, 초기 상태를 처리하는 과정에서 임시 옵션이라는 형태로 빈 문자열 value를 가진 `SelectItem`이 직접 만들어지고 있었던 것이 원인이었습니다.


<br>


## 🛠️ Solution


"아직 아무 옵션도 선택하지 않은 상태"와 "실제 옵션 하나를 선택한 상태"를 명확히 분리하여 관리하는 것이 핵심이었습니다.


**1. 미선택 상태는** **`undefined`****로 관리**


```javascript
const [selectedValue, setSelectedValue] = useState<string | undefined>(undefined)
```


**2. Placeholder는 옵션이 아니라** **`SelectValue`****의 속성으로 처리**


```javascript
<Select value={selectedValue} onValueChange={setSelectedValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select" />
  </SelectTrigger>
  <SelectContent>
    {options.map((option) => (
      <SelectItem key={option.value} value={option.value}>
        {option.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```


**3. 로딩 상태도 fallback 옵션 없이 처리**


```javascript
<Select
  value={selectedValue}
  onValueChange={setSelectedValue}
  disabled={isLoading || options.length === 0}
>
  <SelectTrigger>
    <SelectValue placeholder={isLoading ? 'Loading...' : 'Select'} />
  </SelectTrigger>
  <SelectContent>
    {options.map((option) => (
      <SelectItem key={option.value} value={option.value}>
        {option.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```


`disabled` 조건은 "선택 값의 존재 여부"가 아니라 "로딩 상태 + 옵션 존재 여부"에만 연결했습니다. 그렇지 않으면 선택값이 없다는 이유로 Select가 영구적으로 비활성화될 수 있습니다.


**4. 로딩 상태 해제는** **`finally`****에서 처리**


```javascript
setIsLoading(true)

try {
  const options = await fetchFilterOptions()
  setOptions(options)
} finally {
  setIsLoading(false)
}
```


**5. API 응답 정규화로 방어 로직 추가**


```javascript
const normalizedOptions = apiOptions
  .map((item) => ({
    value: String(item.value).trim(),
    label: item.label,
  }))
  .filter((item) => item.value.length > 0)
```


<br>


## ✅ Result


`SelectItem`에 빈 문자열 value가 전달될 여지를 구조적으로 없앰으로써 Radix Select의 value 에러를 해결했습니다. placeholder, 로딩 상태, 실제 선택 가능한 옵션이라는 세 가지 개념을 명확히 분리하니 Select 컴포넌트의 동작이 훨씬 안정적으로 예측 가능해졌습니다. 사용자는 로딩이 끝난 뒤 옵션을 정상적으로 선택할 수 있게 되었고, 필터 UI의 사용성도 함께 개선되었습니다.


<br>


## 💡 Takeaways

- Radix Select에서 `value=""`는 일반 옵션이 아니라 **선택 해제 및 placeholder 표시를 위한 예약 값**이다. 실제 옵션의 value로 사용해서는 안 된다.
- placeholder, loading, empty 같은 "옵션이 아닌 상태"를 가짜 옵션으로 흉내 내려는 유혹을 조심해야 한다. 대신 `disabled`, `SelectValue placeholder`, `undefined` state 같은 컴포넌트 본연의 API를 활용하는 편이 훨씬 안전하다.
- 외부(API) 데이터를 UI 컴포넌트에 그대로 흘려보내지 않고, 렌더링 직전에 한 번 정규화하는 방어 로직을 습관화하면 이런 종류의 에지 케이스를 사전에 차단할 수 있다.
