(function() {
  var BLEFirmata, BlendMicro, debug, events, exports,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  events = require('eventemitter2');

  BlendMicro = require('blendmicro');

  debug = require('debug')('ble-firmata');

  exports = module.exports = BLEFirmata = (function(_super) {
    __extends(BLEFirmata, _super);

    BLEFirmata.INPUT = 0;

    BLEFirmata.OUTPUT = 1;

    BLEFirmata.ANALOG = 2;

    BLEFirmata.PWM = 3;

    BLEFirmata.SERVO = 4;

    BLEFirmata.SHIFT = 5;

    BLEFirmata.I2C = 6;

    BLEFirmata.LOW = 0;

    BLEFirmata.HIGH = 1;

    BLEFirmata.MAX_DATA_BYTES = 32;

    BLEFirmata.DIGITAL_MESSAGE = 0x90;

    BLEFirmata.ANALOG_MESSAGE = 0xE0;

    BLEFirmata.REPORT_ANALOG = 0xC0;

    BLEFirmata.REPORT_DIGITAL = 0xD0;

    BLEFirmata.SET_PIN_MODE = 0xF4;

    BLEFirmata.REPORT_VERSION = 0xF9;

    BLEFirmata.SYSTEM_RESET = 0xFF;

    BLEFirmata.START_SYSEX = 0xF0;

    BLEFirmata.END_SYSEX = 0xF7;

    function BLEFirmata() {
      this.reconnect = true;
      this.state = 'close';
      this.wait_for_data = 0;
      this.execute_multi_byte_command = 0;
      this.multi_byte_channel = 0;
      this.stored_input_data = [];
      this.parsing_sysex = false;
      this.sysex_bytes_read = 0;
      this.digital_output_data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      this.digital_input_data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      this.analog_input_data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      this.boardVersion = null;
    }

    BLEFirmata.prototype.connect = function(peripheral_name) {
      this.peripheral_name = peripheral_name != null ? peripheral_name : "BlendMicro";
      this.once('boardReady', function() {
        var io_init_wait;
        debug("boardReady \"" + this.peripheral_name + "\"");
        io_init_wait = 100;
        debug("wait " + io_init_wait + "(msec)");
        return setTimeout((function(_this) {
          return function() {
            var i, _i, _j;
            for (i = _i = 0; _i < 6; i = ++_i) {
              _this.write([BLEFirmata.REPORT_ANALOG | i, 1]);
            }
            for (i = _j = 0; _j < 2; i = ++_j) {
              _this.write([BLEFirmata.REPORT_DIGITAL | i, 1]);
            }
            debug('init IO ports');
            return _this.emit('connect');
          };
        })(this), io_init_wait);
      });
      if (!this.ble) {
        this.ble = new BlendMicro(this.peripheral_name);
      } else {
        this.ble.open();
      }
      this.ble.once('open', (function(_this) {
        return function() {
          var cid;
          debug('BLE open');
          cid = setInterval(function() {
            debug('request REPORT_VERSION');
            return _this.force_write([BLEFirmata.REPORT_VERSION]);
          }, 1000);
          _this.once('boardVersion', function(version) {
            clearInterval(cid);
            _this.state = 'open';
            return _this.emit('boardReady');
          });
          _this.ble.on('data', function(data) {
            var byte, _i, _len, _results;
            _results = [];
            for (_i = 0, _len = data.length; _i < _len; _i++) {
              byte = data[_i];
              _results.push(_this.process_input(byte));
            }
            return _results;
          });
          return _this.ble.once('close', function() {
            _this.state = 'close';
            clearInterval(cid);
            debug('BLE close');
            _this.emit('disconnect');
            if (_this.reconnect) {
              return setTimeout(function() {
                debug("try re-connect " + _this.peripheral_name);
                return _this.connect(_this.peripheral_name);
              }, 1000);
            }
          });
        };
      })(this));
      return this;
    };

    BLEFirmata.prototype.isOpen = function() {
      return this.state === 'open';
    };

    BLEFirmata.prototype.close = function(callback) {
      this.state = 'close';
      return this.ble.close(callback);
    };

    BLEFirmata.prototype.reset = function(callback) {
      return this.write([BLEFirmata.SYSTEM_RESET], callback);
    };

    BLEFirmata.prototype.write = function(bytes, callback) {
      if (this.state !== 'open') {
        return;
      }
      return this.force_write(bytes, callback);
    };

    BLEFirmata.prototype.force_write = function(bytes, callback) {
      var err;
      try {
        if (this.ble.state !== 'connected') {
          return;
        }
        return this.ble.write(bytes, callback);
      } catch (_error) {
        err = _error;
        return this.ble.close;
      }
    };

    BLEFirmata.prototype.sysex = function(command, data, callback) {
      var write_data;
      if (data == null) {
        data = [];
      }
      data = data.map(function(i) {
        return i & 0x7f;
      });
      write_data = [BLEFirmata.START_SYSEX, command].concat(data, [BLEFirmata.END_SYSEX]);
      return this.write(write_data, callback);
    };

    BLEFirmata.prototype.pinMode = function(pin, mode, callback) {
      switch (mode) {
        case true:
          mode = BLEFirmata.OUTPUT;
          break;
        case false:
          mode = BLEFirmata.INPUT;
      }
      return this.write([BLEFirmata.SET_PIN_MODE, pin, mode], callback);
    };

    BLEFirmata.prototype.digitalWrite = function(pin, value, callback) {
      var port_num;
      this.pinMode(pin, BLEFirmata.OUTPUT);
      port_num = (pin >>> 3) & 0x0F;
      if (value === 0 || value === false) {
        this.digital_output_data[port_num] &= ~(1 << (pin & 0x07));
      } else {
        this.digital_output_data[port_num] |= 1 << (pin & 0x07);
      }
      return this.write([BLEFirmata.DIGITAL_MESSAGE | port_num, this.digital_output_data[port_num] & 0x7F, this.digital_output_data[port_num] >>> 7], callback);
    };

    BLEFirmata.prototype.analogWrite = function(pin, value, callback) {
      value = Math.floor(value);
      this.pinMode(pin, BLEFirmata.PWM);
      return this.write([BLEFirmata.ANALOG_MESSAGE | (pin & 0x0F), value & 0x7F, value >>> 7], callback);
    };

    BLEFirmata.prototype.servoWrite = function(pin, angle, callback) {
      this.pinMode(pin, BLEFirmata.SERVO);
      return this.write([BLEFirmata.ANALOG_MESSAGE | (pin & 0x0F), angle & 0x7F, angle >>> 7], callback);
    };

    BLEFirmata.prototype.digitalRead = function(pin) {
      return ((this.digital_input_data[pin >>> 3] >>> (pin & 0x07)) & 0x01) > 0;
    };

    BLEFirmata.prototype.analogRead = function(pin) {
      return this.analog_input_data[pin];
    };

    BLEFirmata.prototype.process_input = function(input_data) {
      var analog_value, command, diff, i, old_analog_value, stat, sysex_command, sysex_data, _i, _results;
      if (this.parsing_sysex) {
        if (input_data === BLEFirmata.END_SYSEX) {
          this.parsing_sysex = false;
          sysex_command = this.stored_input_data[0];
          sysex_data = this.stored_input_data.slice(1, this.sysex_bytes_read);
          return this.emit('sysex', {
            command: sysex_command,
            data: sysex_data
          });
        } else {
          this.stored_input_data[this.sysex_bytes_read] = input_data;
          return this.sysex_bytes_read += 1;
        }
      } else if (this.wait_for_data > 0 && input_data < 128) {
        this.wait_for_data -= 1;
        this.stored_input_data[this.wait_for_data] = input_data;
        if (this.execute_multi_byte_command !== 0 && this.wait_for_data === 0) {
          switch (this.execute_multi_byte_command) {
            case BLEFirmata.DIGITAL_MESSAGE:
              input_data = (this.stored_input_data[0] << 7) + this.stored_input_data[1];
              diff = this.digital_input_data[this.multi_byte_channel] ^ input_data;
              this.digital_input_data[this.multi_byte_channel] = input_data;
              if (this.listeners('digitalChange').length > 0) {
                _results = [];
                for (i = _i = 0; _i <= 13; i = ++_i) {
                  if (((0x01 << i) & diff) > 0) {
                    stat = (input_data & diff) > 0;
                    _results.push(this.emit('digitalChange', {
                      pin: i + this.multi_byte_channel * 8,
                      value: stat,
                      old_value: !stat
                    }));
                  } else {
                    _results.push(void 0);
                  }
                }
                return _results;
              }
              break;
            case BLEFirmata.ANALOG_MESSAGE:
              analog_value = (this.stored_input_data[0] << 7) + this.stored_input_data[1];
              old_analog_value = this.analogRead(this.multi_byte_channel);
              this.analog_input_data[this.multi_byte_channel] = analog_value;
              if (old_analog_value !== analog_value) {
                return this.emit('analogChange', {
                  pin: this.multi_byte_channel,
                  value: analog_value,
                  old_value: old_analog_value
                });
              }
              break;
            case BLEFirmata.REPORT_VERSION:
              this.boardVersion = "" + this.stored_input_data[1] + "." + this.stored_input_data[0];
              return this.emit('boardVersion', this.boardVersion);
          }
        }
      } else {
        if (input_data < 0xF0) {
          command = input_data & 0xF0;
          this.multi_byte_channel = input_data & 0x0F;
        } else {
          command = input_data;
        }
        if (command === BLEFirmata.START_SYSEX) {
          this.parsing_sysex = true;
          return this.sysex_bytes_read = 0;
        } else if (command === BLEFirmata.DIGITAL_MESSAGE || command === BLEFirmata.ANALOG_MESSAGE || command === BLEFirmata.REPORT_VERSION) {
          this.wait_for_data = 2;
          return this.execute_multi_byte_command = command;
        }
      }
    };

    return BLEFirmata;

  })(events.EventEmitter2);

}).call(this);
