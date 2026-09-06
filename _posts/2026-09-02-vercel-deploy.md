---
title: Vercel로 5분 만에 GitHub 프로젝트 웹 사이트 무료 배포하기
date: '2026-09-02 00:00:00 +0900'
permalink: /posts/vercel-deploy/
categories:
  - "\U0001D5DB\U0001D5FC\U0001D604 \U0001D5E7\U0001D5FC"
tags:
  - Deploy
  - React
  - Vercel
  - 배포
notion_id: 3cf0b704-6937-802c-94f2-ddb645333ff1
notion_last_edited: '2026-09-06T20:26:00.000Z'
notion_asset_dir: assets/img/posts/vercel-deploy
notion_sync_version: 4
---

## 🌱 Context


웹 포트폴리오를 제작한 뒤, 다른 사람도 실제 웹 사이트에 접속할 수 있도록 배포가 필요했습니다. 여러 배포 방법 중 GitHub Repository와 간단하게 연동할 수 있고 개인 프로젝트를 무료로 배포할 수 있는 **Vercel**을 사용하였습니다.

> **배포할 프로젝트가 이미 GitHub Repository에 올라가 있다는 전제** 하에 작성
>
> Private Repository 이더라도 배포 가능
>
>

<br>


## 🚀 **①** Sign Up


[Vercel](https://vercel.com/)에 접속하여 계정을 생성합니다.


![](/assets/img/posts/vercel-deploy/image-1.png)


보통 GitHub 계정으로 아이디로 가입을 많이 하시는 것 같지만


GitHub = Google 계정이기 때문에 **Continue with Google**로 진행하였습니다.


다만 직접 배포를 진행해 보니 이후 GitHub Repository를 연동해야 하므로 처음부터 **Continue with GitHub**을 택하는 게 더 간편한 듯 합니다.


<br>


## 🪴 Choose a Plan


![](/assets/img/posts/vercel-deploy/image-2.png)


개인 웹 포트폴리오를 배포할 것이라 **`I’m working on personal projects (Hobby)`**를 택하였습니다.


`Team Name`은 자유롭게 작성하고 다음 단계로 이동합니다.


<br>


## 🔗 **③** Import Git Repository


![](/assets/img/posts/vercel-deploy/image-3.png)


`Import Git Repository` 란에서 `GitHub`를 선택합니다.


연결 후 배포하려는 프로젝트를 선택하여 `Import` 합니다.


구글 계정으로 가입하였기 때문에 이 과정에서 별도의 권한 설정 및 인증이 필요하였으나 GitHub로 가입하신 분들은 해당 절차가 생략될 듯 합니다.


<br>


## ⚙️ **④** Deploy


![](/assets/img/posts/vercel-deploy/image-4.png)



제가 사용한 프로젝트는 React + Vite 기반으로 제작되어 있는데, 별도의 설정 없이도 Application Preset이 **`Vite`**로 잘 감지되었습니다.

설정을 확인한 뒤 `Deplpy`를 클릭하면 빌드와 배포가 진행됩니다.


<br>


## 🌐 **⑤** Change Domain


초기 배포 시에는 자동으로 주소가 생성되지만 직접 변경할 수 있습니다.


<br>


---


<br>


그렇게 가입부터 배포, 도메인 변경까지 5분도 안 걸린 나의 첫 배포.


혼자 사이트를 쓰다듬느라 계속 검색하여 들어가다가 사건이 발생하는데… 𝑻𝒐 𝑩𝒆 𝑪𝒐𝒏𝒕𝒊𝒏𝒖𝒆𝒅

