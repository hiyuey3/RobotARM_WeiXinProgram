// pages/arm/arm.js Created by Yue Yu
// www.5i03.cn
// 你说机械做的心会梦见电子蝴蝶吗？



const MQTT = require('../../utils/mqtt.js')

// MQTT 服务器地址：默认使用开发调试的 ws 地址。
// 生产/真机调试请使用 wss 并在小程序后台添加合法域名。

const MQTT_URL = 'ws://mqtt.5i03.cn:8083/mqtt'

Page({
  data: {
    mqtt: null,
    connected: false,
    macAddress: '',  // 设备MAC地址
    localIP: '',  // 局域网IP地址
    videoUrl: '',
    servo0: 90,
    servo1: 90,
    servo2: 90,
    statusText: '等待连接...',  // 状态栏显示文字
    topicDown: '',  // 下行主题
    topicUp: '',  // 上行主题
    reports: [] // 上报监听列表，确保模板有初始值
  },

  onLoad() {
    // 在 onLoad 中初始化 MQTT 连接
    this.connectMQTT()
  },

  // 设置MAC地址
  setMacAddress(e) {
    const macAddress = e.detail.value
    const topicDown = `/iot/device/${macAddress}/down`
    const topicUp = `/iot/device/${macAddress}/up`
    this.setData({ 
      macAddress,
      topicDown,
      topicUp
    })

    // 如果已经连接，则自动订阅上行主题，方便即时查看上报
    if (this.data.connected && this.data.mqtt && macAddress) {
      const ok = this.data.mqtt.subscribe(topicUp)
      if (ok) {
        this.setData({ statusText: `已自动订阅: ${topicUp}` })
        console.log('已自动订阅主题', topicUp)
        wx.showToast({ title: '已订阅', icon: 'success' })
      } else {
        console.warn('自动订阅失败', topicUp)
      }
    }
  },

  // 设置局域网IP
  setLocalIP(e) {
    const localIP = e.detail.value
    this.setData({ 
      localIP,
      videoUrl: `http://${localIP}:81/stream`
    })
  },

  // 连接MQTT服务器
  connectMQTT() {
    const that = this
    const mqtt = new MQTT()

    // 使用配置的 MQTT_URL 连接
    // 注意：开发工具中可勾选“不校验合法域名”用于本地开发
    // 真机/线上请使用 wss 并在小程序后台配置 socket 合法域名
    mqtt.connect(MQTT_URL)
      .then(() => {
        that.setData({ 
          connected: true, 
          mqtt,
          statusText: 'MQTT连接成功，请输入设备MAC地址',
          reports: []
        })
        wx.showToast({
          title: 'MQTT连接成功',
          icon: 'success'
        })
        
        // 设置消息接收回调
        mqtt.onMessage((topic, message) => {
          console.log('收到消息:', topic, message)
          // 支持通配符主题匹配（例如 /iot/device/+/up）
          const filter = that.data.topicUp || '/iot/device/+/up'
          if (that._topicFilterMatch(filter, topic)) {
            try {
              // 将接收到的 JSON 或字符串转换为文本
              const text = typeof message === 'string' ? message : JSON.stringify(message)
              // 去除 emoji 字符
              const clean = that._stripEmojis(text)
              // 更新状态栏，并将新上报加入 reports 列表（最多保留 50 条）
              const reports = that.data.reports || []
              reports.unshift(`${new Date().toLocaleTimeString()}: ${clean}`)
              if (reports.length > 50) reports.pop()
              that.setData({ 
                statusText: `收到反馈: ${clean}`,
                reports
              })
            } catch (err) {
              console.error('解析消息失败:', err)
            }
          }
        })
        // 如果在连接前已填写 MAC 地址，则自动订阅上行主题
        // 根据是否填写 MAC 决定订阅具体设备还是所有设备上行
        const subscribeTopic = that.data.macAddress ? that.data.topicUp : '/iot/device/+/up'
        if (subscribeTopic) {
          const ok = mqtt.subscribe(subscribeTopic)
          if (ok) {
            that.setData({ statusText: `已订阅主题: ${subscribeTopic}`, topicUp: subscribeTopic })
            console.log('连接后自动订阅', subscribeTopic)
          } else {
            console.warn('连接后自动订阅失败', subscribeTopic)
          }
        }
      })
      .catch(err => {
        console.error('MQTT连接失败:', err)
        that.setData({ 
          connected: false,
          statusText: 'MQTT连接失败，请检查网络'
        })
        wx.showToast({
          title: 'MQTT连接失败',
          icon: 'none'
        })
      })
  },

  // 订阅上行主题
  subscribeUpTopic() {
    if (!this.data.macAddress) {
      wx.showToast({
        title: '请输入MAC地址',
        icon: 'none'
      })
      return
    }

    if (!this.data.connected || !this.data.mqtt) {
      wx.showToast({
        title: 'MQTT未连接',
        icon: 'none'
      })
      return
    }

    // 订阅上行主题
    this.data.mqtt.subscribe(this.data.topicUp)
    this.setData({
      statusText: `已订阅主题: ${this.data.topicUp}`
    })
    wx.showToast({
      title: '订阅成功',
      icon: 'success'
    })
  },

  // 移除字符串中的 emoji（简单实现，移除代理对和变异选择子）
  _stripEmojis(str) {
    if (!str) return str
    // 删除代理对（大多数 emoji）和变异选择器
    return String(str).replace(/\uFE0F/g, '').replace(/[\uD800-\uDFFF]/g, '')
  },

  // 判断 topic 是否匹配带通配符的 filter（支持 + 和 #）
  _topicFilterMatch(filter, topic) {
    if (!filter) return false
    // 若没有通配符则直接比较
    if (filter.indexOf('+') === -1 && filter.indexOf('#') === -1) {
      return filter === topic
    }
    // 转换为正则：
    // - 转义特殊字符
    // - 替换 + 为 [^/]+, # 为 .* ，保证整段匹配
    const esc = filter.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const pattern = esc.replace(/\\\+/g, '[^/]+').replace(/\\#/g, '.*')
    const re = new RegExp('^' + pattern + '$')
    return re.test(topic)
  },

  // 舵机0滑动事件（滑动结束时触发）
  onServo0Change(e) {
    const angle = e.detail.value
    this.setData({ servo0: angle })
    this.sendServoCommand(0, angle)
  },

  // 舵机1滑动事件（滑动结束时触发）
  onServo1Change(e) {
    const angle = e.detail.value
    this.setData({ servo1: angle })
    this.sendServoCommand(1, angle)
  },

  // 舵机2滑动事件（滑动结束时触发）
  onServo2Change(e) {
    const angle = e.detail.value
    this.setData({ servo2: angle })
    this.sendServoCommand(2, angle)
  },

  // 发送舵机控制指令
  sendServoCommand(servoIndex, angle) {
    if (!this.data.macAddress) {
      wx.showToast({
        title: '请先输入MAC地址',
        icon: 'none'
      })
      return
    }

    if (!this.data.connected || !this.data.mqtt) {
      wx.showToast({
        title: 'MQTT未连接',
        icon: 'none'
      })
      return
    }

    // 发送 JSON 格式: {"servo": index, "angle": value}
    const message = JSON.stringify({
      servo: servoIndex,
      angle: angle
    })

    console.log('发送控制指令:', this.data.topicDown, message)
    const success = this.data.mqtt.publish(this.data.topicDown, message)
    
    if (success) {
      console.log('指令发送成功')
      this.setData({
        statusText: `已发送: 舵机${servoIndex} 角度${angle}°`
      })
    } else {
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      })
    }
  },

  // 复位所有舵机到90度
  goHome() {
    this.setData({
      servo0: 90,
      servo1: 90,
      servo2: 90
    })
    this.sendServoCommand(0, 90)
    setTimeout(() => this.sendServoCommand(1, 90), 100)
    setTimeout(() => this.sendServoCommand(2, 90), 200)
  },

  onUnload() {
    if (this.data.mqtt) {
      this.data.mqtt.close()
    }
  }
})
